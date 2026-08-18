/**
 * The flow, as data.
 *
 * Every state of the conversation is an entry in this table: what it says when
 * the client arrives, what answers it accepts, and where each answer goes. The
 * interpreter in `engine.ts` reads this and nothing else, so this file is the
 * one place to look to know what the bot does.
 *
 * Because it is data and not a `switch`, `tests/flow.test.ts` can walk it and
 * fail the build when a transition points at a state that does not exist, when
 * a state cannot be reached from the menu, or when a state has no way out.
 */

import type { Agenda, Appointment, Effect } from "../shop/agenda.ts";
import { appointmentId, byId, upcoming } from "../shop/agenda.ts";
import type { Service, Shop } from "../shop/shop.ts";
import { byCategory, isBarber, serviceById } from "../shop/shop.ts";
import { byPeriod, daysWithSlots, freeSlots } from "../shop/slots.ts";
import type { Choice, Ctx, Session, StateName } from "./session.ts";
import { clearDraft } from "./session.ts";
import { BARBEIRO } from "./barbeiro.ts";
import type { Enter, Flow, Outcome, State } from "./engine.ts";
import { numbered, run, says, silent } from "./engine.ts";
import {
  anyHour,
  anything,
  choice,
  either,
  keyword,
  name as aName,
  no,
  offeredHour,
  nearestHour,
  option,
  yes,
} from "./match.ts";
import { advance } from "../store.ts";
import type { Message } from "./message.ts";
import { msg } from "./message.ts";

/** How many days the day menu offers before the client has to say a date. */
const DAYS_SHOWN = 6;

// --- reading the draft -----------------------------------------------------

function draftService(session: Session, ctx: Ctx): Service | null {
  const id = session.draft.serviceId;
  return id ? serviceById(ctx.shop, id) : null;
}

/**
 * The agenda as it matters to this client right now.
 *
 * While remarcando, the appointment being moved must not block its own new
 * hour: the client would be told that the slot they already hold is taken. So
 * it is removed from the agenda for every free hour calculation, and put back
 * by the cancel effect only when the new booking is confirmed.
 */
function agendaFor(session: Session, ctx: Ctx): Agenda {
  const replacing = session.draft.replacing;
  return replacing ? ctx.agenda.filter((a) => a.id !== replacing) : ctx.agenda;
}

/** Is the hour in the draft still free? Asked when offering, and again when confirming. */
function draftSlotFree(session: Session, ctx: Ctx): boolean {
  const service = draftService(session, ctx);
  const { day, start } = session.draft;
  if (!service || !day || start === undefined) return false;
  return freeSlots(ctx.shop, agendaFor(session, ctx), day, service, ctx.now).includes(start);
}

function hasDays(session: Session, ctx: Ctx): boolean {
  const service = draftService(session, ctx);
  if (!service) return false;
  return daysWithSlots(ctx.shop, agendaFor(session, ctx), service, ctx.now, 1).length > 0;
}

/**
 * Para onde "voltar" pode levar. É a lista que o teste do grafo lê, e um teste
 * separado cobra que todo `back` da tabela esteja aqui dentro.
 */
const BACK_TARGETS = ["menu", "escolher_faixa", "escolher_servico", "escolher_dia"];

function backFrom(session: Session): StateName {
  return FLOW.states[session.state]?.back ?? "menu";
}

/**
 * Onde fica o "voltar" num menu de tamanho fixo.
 *
 * As listas dinâmicas ganham a última linha de `numbered()`, que sabe quantos
 * itens saíram. Um menu escrito à mão não tem quem conte por ele, então o
 * número é uma constante, usada nos dois lugares, no texto e na transição ,
 * para não haver como um andar sem o outro.
 */
const VOLTAR_O_QUE_FAZER = 3;

// --- the states ------------------------------------------------------------

const menu: State = {
  // Arriving at the menu ends whatever was being assembled, so a client who
  // gives up halfway through a booking does not carry half a draft around.
  enter: (session) => ({ session: clearDraft(session), messages: [msg("menu")] }),
  on: [
    {
      // Quem já tem horário marcado é avisado antes de marcar outro. Marcar
      // dois é permitido, o cliente que corta o cabelo e leva o filho faz
      // isso , mas quem esqueceu que já tinha precisa ser lembrado, e não
      // descobrir na semana seguinte com dois horários no nome.
      match: option(1),
      go: (session, ctx) =>
        upcoming(ctx.agenda, session.phone, ctx.now).length > 0
          ? "ja_tem_horario"
          : "escolher_faixa",
      exits: ["ja_tem_horario", "escolher_faixa"],
    },
    {
      match: option(2),
      go: (session, ctx) =>
        upcoming(ctx.agenda, session.phone, ctx.now).length > 0
          ? "meus_agendamentos"
          : "sem_agendamentos",
      exits: ["meus_agendamentos", "sem_agendamentos"],
    },
    { match: option(3), go: "precos" },
    { match: option(4), go: "horarios" },
    { match: option(5), go: "endereco" },
    { match: option(6), go: "humano" },
  ],
};

/**
 * A saudação é o menu com outra abertura, e não uma mensagem antes dele.
 *
 * Duas mensagens seguidas é o bot falando sozinho enquanto a pessoa espera, e
 * a segunda é a única que pede resposta. Herdando o resto do `menu` por espalha,
 * uma opção nova entra num lugar só, não há como as duas telas de entrada
 * discordarem sobre o que o bot sabe fazer.
 */
const saudacao: State = {
  ...menu,
  // Repetir a pergunta não é chegar de novo: quem não foi entendido aqui lê o
  // menu outra vez, e não "olá" outra vez. O contador de erros é o que separa
  // a primeira entrada da repetição, e ele só é maior que zero na repetição.
  enter: (session) => ({
    session: clearDraft(session),
    messages: [msg(session.misses > 0 ? "menu" : "saudacao")],
  }),
};

/**
 * A faixa antes do serviço, porque dezesseis linhas não são um menu.
 *
 * A tabela inteira numa mensagem só era uma parede: dezesseis linhas, mais do
 * que as dez que uma lista do WhatsApp abre, então o passo mais usado do bot era
 * justamente o único que não podia virar lista. Partida em faixas, cada tela
 * cabe (três linhas aqui, no máximo oito depois) e as duas viram lista.
 *
 * O custo é uma resposta a mais para marcar, e ele é pago por quem procura: a
 * faixa é a mesma da tabela da parede, então quem já viu o preço já sabe onde
 * o serviço está.
 */
const escolherFaixa: State = {
  enter: (session, ctx) => {
    const faixas = byCategory(ctx.shop, ctx.shop.services);
    const lista = numbered(
      faixas.map((grupo, i) =>
        msg("item_faixa", {
          n: i + 1,
          nome: grupo.category.name,
          emoji: grupo.category.emoji,
          quantos: grupo.services.length,
        }),
      ),
      faixas.map((grupo): Choice => ({ kind: "categoria", id: grupo.category.id })),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("escolher_faixa", { itens: lista.itens })],
    };
  },
  on: [
    {
      match: choice("categoria"),
      act: (session, match) => ({
        session:
          match.choice?.kind === "categoria"
            ? { ...session, draft: { ...session.draft, categoryId: match.choice.id } }
            : session,
      }),
      go: "escolher_servico",
    },
  ],
};

const escolherServico: State = {
  enter: (session, ctx) => {
    const faixa = session.draft.categoryId;
    const servicos = ctx.shop.services.filter((service) => service.category === faixa);
    // Uma faixa que ficou sem serviço nenhum (o barbeiro tirou o último) não
    // tem pergunta a fazer: manda de volta para a lista de faixas.
    if (servicos.length === 0) return { session, messages: [], go: "escolher_faixa" };

    const lista = numbered(
      servicos.map((service, i) =>
        msg("item_servico", {
          n: i + 1,
          nome: service.name,
          minutos: service.minutes,
          preco: service.price,
        }),
      ),
      servicos.map((service): Choice => ({ kind: "service", id: service.id })),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("escolher_servico", { itens: lista.itens })],
    };
  },
  exits: ["escolher_faixa"],
  back: "escolher_faixa",
  on: [
    {
      match: choice("service"),
      act: (session, match) => ({
        session:
          match.choice?.kind === "service"
            ? { ...session, draft: { ...session.draft, serviceId: match.choice.id } }
            : session,
      }),
      go: (session, ctx) => (hasDays(session, ctx) ? "escolher_dia" : "sem_horarios"),
      exits: ["escolher_dia", "sem_horarios"],
    },
  ],
};

const escolherDia: State = {
  enter: (session, ctx) => {
    const service = draftService(session, ctx);
    if (!service) return { session, messages: [], go: "menu" };

    const days = daysWithSlots(ctx.shop, agendaFor(session, ctx), service, ctx.now, DAYS_SHOWN);
    if (days.length === 0) return { session, messages: [], go: "sem_horarios" };

    const lista = numbered(
      days.map((day, i) => msg("item_dia", { n: i + 1, dia: day })),
      days.map((day) => ({ kind: "day", day }) as const),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("escolher_dia", { servico: service.name, itens: lista.itens })],
    };
  },
  exits: ["menu", "sem_horarios"],
  back: "escolher_servico",
  on: [
    {
      match: choice("day"),
      act: (session, match) => ({
        session:
          match.choice?.kind === "day"
            ? { ...session, draft: { ...session.draft, day: match.choice.day } }
            : session,
      }),
      go: "escolher_hora",
    },
  ],
};

const escolherHora: State = {
  enter: (session, ctx) => {
    const service = draftService(session, ctx);
    const day = session.draft.day;
    if (!service || !day) return { session, messages: [], go: "menu" };

    const hours = freeSlots(ctx.shop, agendaFor(session, ctx), day, service, ctx.now);
    if (hours.length === 0) return { session, messages: [], go: "escolher_dia" };

    // O dia inteiro numa mensagem só. Os períodos entram como título, para dar
    // respiro na leitura, e a numeração corre por cima deles: o cliente conta a
    // lista de ponta a ponta, e é a mesma ordem guardada nas ofertas.
    const choices: Choice[] = hours.map((start) => ({ kind: "slot", start }));
    const itens: Message[] = [];
    let n = 0;
    for (const group of byPeriod(ctx.shop, hours)) {
      itens.push(msg("cabecalho_periodo", { periodo: group.period.id }));
      for (const start of group.hours) {
        itens.push(msg("item_hora", { n: ++n, hora: start }));
      }
    }

    const lista = numbered(itens, choices);
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("escolher_hora", { dia: day, itens: lista.itens })],
    };
  },
  exits: ["menu", "escolher_dia"],
  back: "escolher_dia",
  on: [
    {
      // O número da lista e a hora digitada levam ao mesmo lugar. Quem lê a
      // lista responde "3", quem já sabe a hora responde "14:30".
      match: either(choice("slot"), offeredHour),
      act: (session, match) => ({
        session:
          match.choice?.kind === "slot"
            ? { ...session, draft: { ...session.draft, start: match.choice.start } }
            : session,
      }),
      go: (session) => (session.name ? "confirmar" : "pedir_nome"),
      exits: ["confirmar", "pedir_nome"],
    },
    {
      // Pediu uma hora que a grade não tem (14:40) e existe vizinha perto.
      match: nearestHour,
      act: (session, match) => ({
        session:
          match.choice?.kind === "slot"
            ? {
                ...session,
                draft: {
                  ...session.draft,
                  start: match.choice.start,
                  ...(match.number === undefined ? {} : { asked: match.number }),
                },
              }
            : session,
      }),
      go: "aproximado",
    },
    // Uma hora que dá para ler mas não está livre merece resposta melhor do que
    // "não entendi", e a ordem das transições é o que separa as três.
    { match: anyHour, go: "hora_indisponivel" },
  ],
};

const pedirNome: State = {
  enter: says(msg("pedir_nome")),
  on: [
    {
      match: aName,
      act: (session, match) => ({
        session: match.text ? { ...session, name: match.text } : session,
      }),
      go: "confirmar",
    },
  ],
};

const confirmar: State = {
  enter: (session, ctx) => {
    const service = draftService(session, ctx);
    const { day, start, replacing } = session.draft;
    if (!service || !day || start === undefined) return { session, messages: [], go: "menu" };

    return {
      session,
      messages: [
        msg(replacing ? "resumo_remarcacao" : "resumo", {
          servico: service.name,
          dia: day,
          hora: start,
          preco: service.price,
          nome: session.name ?? "",
        }),
        msg("confirmar"),
      ],
    };
  },
  exits: ["menu"],
  on: [
    {
      match: yes,
      act: (session, _match, ctx) => {
        if (!draftSlotFree(session, ctx)) return { session };
        const service = draftService(session, ctx)!;
        const day = session.draft.day!;
        const start = session.draft.start!;
        const appointment: Appointment = {
          id: appointmentId(session.phone, day, start),
          day,
          start,
          minutes: service.minutes,
          serviceId: service.id,
          clientName: session.name ?? "",
          phone: session.phone,
        };
        const replacing = session.draft.replacing;
        const effects: Effect[] = replacing
          ? [{ kind: "cancel", id: replacing }, { kind: "book", appointment }]
          : [{ kind: "book", appointment }];
        return { session, effects };
      },
      // The world may have moved between the offer and the "sim", which is the
      // one race a booking bot always has. The check happens again here.
      go: (session, ctx) =>
        !draftSlotFree(session, ctx)
          ? "slot_ocupado"
          : session.draft.replacing
            ? "remarcado"
            : "agendado",
      exits: ["slot_ocupado", "remarcado", "agendado"],
    },
    { match: no, go: "nao_agendado" },
  ],
};

const slotOcupado: State = {
  // Back to the hours of the same day, because the list the client was reading
  // is now wrong.
  enter: (session) => ({
    session,
    messages: [msg("slot_ocupado")],
    go: "escolher_hora",
  }),
  exits: ["escolher_hora"],
};

function confirmationOf(key: "agendado" | "remarcado"): Enter {
  return (session, ctx) => {
    const service = draftService(session, ctx);
    const { day, start } = session.draft;
    if (!service || !day || start === undefined) return { session, messages: [] };
    return {
      session,
      messages: [
        msg(key, {
          servico: service.name,
          dia: day,
          hora: start,
          nome: session.name ?? "",
          endereco: ctx.shop.address,
        }),
      ],
    };
  };
}

/**
 * O aviso antes do segundo horário.
 *
 * Ele não impede nada: quem quer mesmo dois horários diz sim e segue pelo mesmo
 * caminho de sempre. Quem esqueceu diz não e cai na lista dos seus horários, de
 * onde dá para cancelar ou remarcar, que é o que ele queria fazer desde o
 * começo, sem saber o nome disso.
 */
const jaTemHorario: State = {
  enter: (session, ctx) => {
    const mine = upcoming(ctx.agenda, session.phone, ctx.now);
    if (mine.length === 0) return { session, messages: [], go: "escolher_faixa" };
    return {
      session,
      messages: [
        msg("ja_tem_horario", {
          itens: mine.map((a) =>
            msg("item_marcado", {
              servico: serviceById(ctx.shop, a.serviceId)?.name ?? a.serviceId,
              dia: a.day,
              hora: a.start,
            }),
          ),
        }),
      ],
    };
  },
  exits: ["escolher_faixa"],
  on: [
    { match: yes, go: "escolher_faixa" },
    { match: no, go: "meus_agendamentos" },
  ],
};

const meusAgendamentos: State = {
  enter: (session, ctx) => {
    const mine = upcoming(ctx.agenda, session.phone, ctx.now);
    if (mine.length === 0) return { session, messages: [], go: "sem_agendamentos" };

    const lista = numbered(
      mine.map((a, i) =>
        msg("item_agendamento", {
          n: i + 1,
          servico: serviceById(ctx.shop, a.serviceId)?.name ?? a.serviceId,
          dia: a.day,
          hora: a.start,
        }),
      ),
      mine.map((a) => ({ kind: "appointment", id: a.id }) as const),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("meus_agendamentos", { itens: lista.itens })],
    };
  },
  exits: ["sem_agendamentos"],
  on: [
    {
      match: choice("appointment"),
      act: (session, match, ctx) => {
        if (match.choice?.kind !== "appointment") return { session };
        const appointment = byId(ctx.agenda, match.choice.id);
        if (!appointment) return { session };
        // The shop already knows this client by the appointment, so remarcar
        // never asks a name it has on file.
        const named = session.name ?? appointment.clientName;
        return {
          session: {
            ...session,
            ...(named ? { name: named } : {}),
            draft: { replacing: appointment.id, serviceId: appointment.serviceId },
          },
        };
      },
      go: "o_que_fazer",
    },
  ],
};

const oQueFazer: State = {
  enter: (session, ctx) => {
    const appointment = session.draft.replacing ? byId(ctx.agenda, session.draft.replacing) : null;
    if (!appointment) return { session, messages: [], go: "menu" };
    return {
      session,
      messages: [
        msg("o_que_fazer", {
          servico: serviceById(ctx.shop, appointment.serviceId)?.name ?? appointment.serviceId,
          dia: appointment.day,
          hora: appointment.start,
          voltar: VOLTAR_O_QUE_FAZER,
        }),
      ],
    };
  },
  exits: ["menu"],
  on: [
    { match: option(1), go: "confirmar_cancelamento" },
    {
      // Remarcar reuses the booking branch. The appointment stays in the draft
      // as `replacing`, and the confirmation turns into a cancel plus a book.
      match: option(2),
      act: (session) => ({ session: { ...session, choices: [] } }),
      go: (session, ctx) => (hasDays(session, ctx) ? "escolher_dia" : "sem_horarios"),
      exits: ["escolher_dia", "sem_horarios"],
    },
    { match: option(VOLTAR_O_QUE_FAZER), go: backFrom, exits: BACK_TARGETS },
  ],
};

const confirmarCancelamento: State = {
  enter: (session, ctx) => {
    const appointment = session.draft.replacing ? byId(ctx.agenda, session.draft.replacing) : null;
    if (!appointment) return { session, messages: [], go: "menu" };
    return {
      session,
      messages: [
        msg("confirmar_cancelamento", {
          servico: serviceById(ctx.shop, appointment.serviceId)?.name ?? appointment.serviceId,
          dia: appointment.day,
          hora: appointment.start,
        }),
      ],
    };
  },
  exits: ["menu"],
  on: [
    {
      match: yes,
      act: (session) => {
        const id = session.draft.replacing;
        return id ? { session, effects: [{ kind: "cancel", id }] } : { session };
      },
      go: "cancelado",
    },
    { match: no, go: "cancelamento_abortado" },
  ],
};

export const FLOW: Flow = {
  advance,
  start: "inicio",
  stuck: "humano",
  missLimit: 3,
  global: [
    { match: keyword("menu", "opcoes"), go: "menu" },
    // A última linha de toda lista. A oferta é posta por `numbered()` e
    // atendida aqui, uma vez, para nenhum estado ter que lembrar disso.
    { match: choice("voltar"), go: backFrom, exits: BACK_TARGETS },
    // "Voltar" é um passo atrás, não o menu. Quem abriu a lista de horas e não
    // gostou de nenhuma queria trocar o dia, e mandá-lo para o menu apagaria
    // também o serviço que ele já tinha escolhido.
    { match: keyword("voltar"), go: backFrom, exits: BACK_TARGETS },
    { match: keyword("sair", "tchau", "encerrar"), go: "despedida" },
  ],
  states: {
    // The bot never speaks first: on WhatsApp the client opens the conversation.
    inicio: { enter: silent, on: [{ match: anything, go: "saudacao" }] },
    saudacao,
    menu,

    precos: { enter: says(msg("precos")), goto: "menu" },
    horarios: { enter: says(msg("horarios")), goto: "menu" },
    endereco: { enter: says(msg("endereco")), goto: "menu" },
    humano: { enter: says(msg("humano")), goto: "inicio" },
    despedida: { enter: says(msg("despedida")), goto: "inicio" },

    ja_tem_horario: jaTemHorario,
    escolher_faixa: escolherFaixa,
    escolher_servico: escolherServico,
    escolher_dia: escolherDia,
    escolher_hora: escolherHora,
    hora_indisponivel: {
      enter: says(msg("hora_indisponivel")),
      goto: "escolher_hora",
    },
    // Avisa que aproximou e segue para a confirmação, onde a hora aparece
    // escrita de novo: o cliente ainda pode dizer não.
    aproximado: {
      enter: (session) => ({
        session,
        messages: [
          msg("aproximei", { pedido: session.draft.asked ?? 0, dado: session.draft.start ?? 0 }),
        ],
        go: session.name ? "confirmar" : "pedir_nome",
      }),
      exits: ["confirmar", "pedir_nome"],
    },
    sem_horarios: { enter: says(msg("sem_horarios")), goto: "menu" },
    pedir_nome: pedirNome,
    confirmar,
    slot_ocupado: slotOcupado,
    agendado: { enter: confirmationOf("agendado"), goto: "menu" },
    remarcado: { enter: confirmationOf("remarcado"), goto: "menu" },
    nao_agendado: { enter: says(msg("nao_agendado")), goto: "menu" },

    meus_agendamentos: meusAgendamentos,
    sem_agendamentos: { enter: says(msg("sem_agendamentos")), goto: "menu" },
    o_que_fazer: oQueFazer,
    confirmar_cancelamento: confirmarCancelamento,
    cancelado: { enter: says(msg("cancelado")), goto: "menu" },
    cancelamento_abortado: { enter: says(msg("cancelamento_abortado")), goto: "menu" },
  },
};

/**
 * One turn of the barbershop bot.
 *
 * O único lugar do projeto que sabe que existem duas conversas. O telefone diz
 * qual tabela roda, e o interpretador não fica sabendo de nada: para ele é
 * sempre a mesma função lendo um `Flow`.
 *
 * A sessão do barbeiro começa em `inicio_barbeiro` e a do cliente em `inicio`,
 * e é por isso que uma sessão guardada com o estado de uma tabela não é lida
 * pela outra: os nomes de estado não se cruzam.
 */
export function reply(session: Session, raw: string, ctx: Ctx): Outcome {
  return run(flowFor(ctx.shop, session.phone), session, raw, ctx);
}

export function flowFor(shop: Shop, phone: string): Flow {
  return isBarber(shop, phone) ? BARBEIRO : FLOW;
}
