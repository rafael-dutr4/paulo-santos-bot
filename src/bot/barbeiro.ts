/**
 * O outro lado do balcão, também como tabela.
 *
 * O barbeiro fala com o mesmo número do bot, pelo mesmo WhatsApp, e o que
 * separa a conversa dele da de um cliente é uma linha: o telefone está em
 * `SHOP.barbers`. Aí `reply()` roda esta tabela em vez da outra, no mesmo
 * interpretador, sem uma única condição dentro de `engine.ts`.
 *
 * Isto é o que valeu a pena ter feito o fluxo virar dado: um produto novo (a
 * agenda do barbeiro, a comanda, o relatório) é um arquivo de tabela ao lado do
 * primeiro, e não um `if` no meio do motor.
 *
 * O barbeiro faz três coisas aqui:
 *
 *   - **ver a agenda**, de hoje ou de um dia qualquer;
 *   - **fechar a comanda** de um atendimento que já passou, dizendo se o
 *     cliente veio, o que saiu e como pagou;
 *   - **pedir o relatório** de um dia, da semana ou do mês.
 *
 * Ver e pedir não escrevem nada. A única escrita desta tabela inteira é o
 * `close` no fim da comanda, e ela sai como efeito, igual a um agendamento.
 */

import type { Appointment, Effect } from "../shop/agenda.ts";
import { byId } from "../shop/agenda.ts";
import type { Comanda } from "../shop/comanda.ts";
import { comandaById, itemFor, itemForProduct, itemsFor, pending, totalOf } from "../shop/comanda.ts";
import type { Range } from "../shop/report.ts";
import { dayRange, monthRange, report, weekRange } from "../shop/report.ts";
import { productById, serviceById } from "../shop/shop.ts";
import type { Day } from "../shop/time.ts";
import type { Enter, Flow, State } from "./engine.ts";
import { says, silent } from "./engine.ts";
import { anything, choice, keyword, money, no, option, someDay, yes } from "./match.ts";
import type { Message } from "./message.ts";
import { msg } from "./message.ts";
import type { ComandaDraft, Ctx, Session, StateName } from "./session.ts";
import { clearDraft } from "./session.ts";

// --- lendo o rascunho ------------------------------------------------------

/** O dia que o barbeiro está olhando. Sem pedido nenhum, é hoje. */
function looking(session: Session, ctx: Ctx): Day {
  return session.draft.looking ?? ctx.now.day;
}

function comandaDraft(session: Session): ComandaDraft | null {
  return session.draft.comanda ?? null;
}

/** O agendamento que a comanda aberta está fechando. */
function target(session: Session, ctx: Ctx): Appointment | null {
  const draft = comandaDraft(session);
  return draft ? byId(ctx.agenda, draft.id) : null;
}

function withComanda(session: Session, comanda: ComandaDraft): Session {
  return { ...session, draft: { ...session.draft, comanda } };
}

function serviceName(ctx: Ctx, id: string): string {
  return serviceById(ctx.shop, id)?.name ?? id;
}

// --- a agenda --------------------------------------------------------------

/**
 * O dia do barbeiro, um horário por linha.
 *
 * Cada linha diz em que pé está: fechada, faltou, ou ainda por fechar. O
 * estado não é guardado em lugar nenhum — ele é a resposta de olhar se existe
 * uma comanda com aquele id, que é a mesma subtração que monta a lista de
 * pendências.
 */
const agenda: State = {
  enter: (session, ctx) => {
    const day = looking(session, ctx);
    const doDia = ctx.agenda.filter((a) => a.day === day);
    if (doDia.length === 0) {
      return { session, messages: [msg("agenda_vazia", { dia: day })] };
    }

    return {
      session,
      messages: [
        msg("agenda_do_dia", {
          dia: day,
          itens: doDia.map((a) => {
            const comanda = comandaById(ctx.comandas, a.id);
            return msg("item_agenda", {
              hora: a.start,
              servico: serviceName(ctx, a.serviceId),
              nome: a.clientName,
              // Três estados possíveis numa palavra só, decididos aqui porque é
              // aqui que a agenda e as comandas estão juntas.
              situacao: comanda ? (comanda.status === "feito" ? "feito" : "faltou") : "aberto",
              total: comanda?.total ?? 0,
            });
          }),
        }),
      ],
    };
  },
  goto: "menu_barbeiro",
};

const pedirDia: State = {
  enter: says(msg("pedir_dia")),
  on: [
    {
      match: someDay,
      act: (session, match) => ({
        session:
          match.choice?.kind === "day"
            ? { ...session, draft: { ...session.draft, looking: match.choice.day } }
            : session,
      }),
      // O mesmo pedido de dia serve à agenda e ao relatório, e o rascunho
      // guarda quem perguntou.
      go: (session) => (session.draft.asking === "relatorio" ? "relatorio_dia" : "agenda"),
      exits: ["agenda", "relatorio_dia"],
    },
  ],
};

// --- a comanda -------------------------------------------------------------

const comandas: State = {
  enter: (session, ctx) => {
    const abertas = pending(ctx.agenda, ctx.comandas, ctx.now);
    if (abertas.length === 0) return { session, messages: [], go: "nada_a_fechar" };

    return {
      session: {
        ...session,
        choices: abertas.map((a) => ({ kind: "appointment", id: a.id }) as const),
      },
      messages: [
        msg("comandas_pendentes", {
          itens: abertas.map((a, i) =>
            msg("item_pendente", {
              n: i + 1,
              dia: a.day,
              hora: a.start,
              servico: serviceName(ctx, a.serviceId),
              nome: a.clientName,
            }),
          ),
        }),
      ],
    };
  },
  exits: ["nada_a_fechar"],
  on: [
    {
      match: choice("appointment"),
      act: (session, match, ctx) => {
        if (match.choice?.kind !== "appointment") return { session };
        const appointment = byId(ctx.agenda, match.choice.id);
        if (!appointment) return { session };
        // A comanda já nasce com o que foi agendado, pelo preço de tabela.
        // Fechar sem mudar nada é o caso de sempre, e é o que custa menos toques.
        return {
          session: withComanda(session, {
            id: appointment.id,
            itens: itemsFor(ctx.shop, appointment),
          }),
        };
      },
      go: "compareceu",
    },
  ],
};

const compareceu: State = {
  enter: (session, ctx) => {
    const appointment = target(session, ctx);
    if (!appointment) return { session, messages: [], go: "menu_barbeiro" };
    return {
      session,
      messages: [
        msg("compareceu", {
          nome: appointment.clientName,
          dia: appointment.day,
          hora: appointment.start,
          servico: serviceName(ctx, appointment.serviceId),
        }),
      ],
    };
  },
  exits: ["menu_barbeiro"],
  on: [
    { match: yes, go: "comanda" },
    {
      // A falta também é um fechamento: sem ela, o horário fica pendente para
      // sempre e o relatório não sabe contar quantos não vieram.
      match: no,
      act: (session, _match, ctx) => {
        const appointment = target(session, ctx);
        if (!appointment) return { session };
        const comanda: Comanda = {
          ...registro(appointment, ctx),
          status: "faltou",
          itens: [],
          total: 0,
        };
        return { session, effects: [{ kind: "close", comanda }] };
      },
      go: "comanda_faltou",
    },
  ],
};

/** O que toda comanda copia do agendamento, tenha o cliente vindo ou não. */
function registro(appointment: Appointment, ctx: Ctx): Omit<Comanda, "status" | "itens" | "total"> {
  return {
    id: appointment.id,
    day: appointment.day,
    start: appointment.start,
    phone: appointment.phone,
    clientName: appointment.clientName,
    closedAt: ctx.now,
  };
}

const comanda: State = {
  enter: (session, ctx) => {
    const draft = comandaDraft(session);
    const appointment = target(session, ctx);
    if (!draft || !appointment) return { session, messages: [], go: "menu_barbeiro" };

    return {
      // Sair da lista de itens limpa o que foi oferecido: as opções daqui são
      // fixas, e uma oferta velha resolveria um número contra a lista errada.
      session: { ...session, choices: [] },
      messages: [
        msg("comanda", {
          nome: appointment.clientName,
          dia: appointment.day,
          hora: appointment.start,
          itens: draft.itens.map((item) =>
            msg("item_comanda", { nome: item.name, valor: item.price }),
          ),
          total: totalOf(draft.itens),
        }),
      ],
    };
  },
  exits: ["menu_barbeiro"],
  on: [
    { match: option(1), go: "servico_extra" },
    { match: option(2), go: "produto_extra" },
    {
      match: option(3),
      // Com uma linha só não há o que escolher, e perguntar qual seria uma
      // pergunta com uma resposta possível.
      act: (session) => {
        const draft = comandaDraft(session);
        return draft && draft.itens.length === 1
          ? { session: withComanda(session, { ...draft, item: 0 }) }
          : { session };
      },
      go: (session) => ((comandaDraft(session)?.itens.length ?? 0) <= 1 ? "pedir_valor" : "escolher_item"),
      exits: ["pedir_valor", "escolher_item"],
    },
    { match: option(4), go: "escolher_pagamento" },
  ],
};

/**
 * O que o cliente levou além do que foi feito.
 *
 * Mesmo desenho do serviço extra, outra lista. O produto não tem duração e não
 * mexe na agenda: ele nasce e morre dentro da comanda.
 */
const produtoExtra: State = {
  enter: (session, ctx) => ({
    session: {
      ...session,
      choices: ctx.shop.products.map((product) => ({ kind: "product", id: product.id }) as const),
    },
    messages: [
      msg("produto_extra", {
        itens: ctx.shop.products.map((product, i) =>
          msg("item_produto", { n: i + 1, nome: product.name, preco: product.price }),
        ),
      }),
    ],
  }),
  back: "comanda",
  on: [
    {
      match: choice("product"),
      act: (session, match, ctx) => {
        const draft = comandaDraft(session);
        if (!draft || match.choice?.kind !== "product") return { session };
        const product = productById(ctx.shop, match.choice.id);
        if (!product) return { session };
        return {
          session: withComanda(session, { ...draft, itens: [...draft.itens, itemForProduct(product)] }),
        };
      },
      go: "comanda",
    },
  ],
};

const servicoExtra: State = {
  enter: (session, ctx) => ({
    session: {
      ...session,
      choices: ctx.shop.services.map((service) => ({ kind: "service", id: service.id }) as const),
    },
    messages: [
      msg("servico_extra", {
        itens: ctx.shop.services.map((service, i) =>
          msg("item_servico", {
            n: i + 1,
            nome: service.name,
            minutos: service.minutes,
            preco: service.price,
          }),
        ),
      }),
    ],
  }),
  back: "comanda",
  on: [
    {
      match: choice("service"),
      act: (session, match, ctx) => {
        const draft = comandaDraft(session);
        if (!draft || match.choice?.kind !== "service") return { session };
        const service = serviceById(ctx.shop, match.choice.id);
        if (!service) return { session };
        return { session: withComanda(session, { ...draft, itens: [...draft.itens, itemFor(service)] }) };
      },
      go: "comanda",
    },
  ],
};

const escolherItem: State = {
  enter: (session, ctx) => {
    const draft = comandaDraft(session);
    if (!draft) return { session, messages: [], go: "menu_barbeiro" };
    return {
      session: {
        ...session,
        choices: draft.itens.map((_item, index) => ({ kind: "item", index }) as const),
      },
      messages: [
        msg("escolher_item", {
          itens: draft.itens.map((item, i) =>
            msg("item_para_corrigir", { n: i + 1, nome: item.name, valor: item.price }),
          ),
        }),
      ],
    };
  },
  exits: ["menu_barbeiro"],
  back: "comanda",
  on: [
    {
      match: choice("item"),
      act: (session, match) => {
        const draft = comandaDraft(session);
        if (!draft || match.choice?.kind !== "item") return { session };
        return { session: withComanda(session, { ...draft, item: match.choice.index }) };
      },
      go: "pedir_valor",
    },
  ],
};

const pedirValor: State = {
  enter: (session, ctx) => {
    const draft = comandaDraft(session);
    const item = draft?.item === undefined ? undefined : draft.itens[draft.item];
    if (!item) return { session, messages: [], go: "comanda" };
    return {
      session,
      messages: [
        msg("pedir_valor", { nome: item.name, valor: item.price }),
      ],
    };
  },
  exits: ["comanda"],
  back: "comanda",
  on: [
    {
      match: money,
      act: (session, match) => ({ session: repriced(session, match.number ?? 0) }),
      go: "comanda",
    },
    {
      // Acrescentou o que não devia, ou o cliente desistiu do pezinho.
      match: keyword("tirar", "remover", "apagar", "excluir"),
      act: (session) => ({ session: withoutItem(session) }),
      go: "comanda",
    },
  ],
};

function repriced(session: Session, price: number): Session {
  const draft = comandaDraft(session);
  if (!draft || draft.item === undefined) return session;
  const itens = draft.itens.map((item, i) => (i === draft.item ? { ...item, price } : item));
  return withComanda(session, { id: draft.id, itens });
}

function withoutItem(session: Session): Session {
  const draft = comandaDraft(session);
  if (!draft || draft.item === undefined) return session;
  return withComanda(session, {
    id: draft.id,
    itens: draft.itens.filter((_item, i) => i !== draft.item),
  });
}

const escolherPagamento: State = {
  enter: (session, ctx) => ({
    session: {
      ...session,
      choices: ctx.shop.payments.map((id) => ({ kind: "payment", id }) as const),
    },
    messages: [
      msg("escolher_pagamento", {
        total: totalOf(comandaDraft(session)?.itens ?? []),
        itens: ctx.shop.payments.map((id, i) => msg("item_pagamento", { n: i + 1, forma: id })),
      }),
    ],
  }),
  back: "comanda",
  on: [
    {
      // A forma de pagamento é a última pergunta de propósito: é ela que fecha
      // a comanda, então até aqui nada foi escrito e desistir não custa nada.
      match: choice("payment"),
      act: (session, match, ctx) => {
        const draft = comandaDraft(session);
        const appointment = target(session, ctx);
        if (!draft || !appointment || match.choice?.kind !== "payment") return { session };
        const comanda: Comanda = {
          ...registro(appointment, ctx),
          status: "feito",
          itens: draft.itens,
          total: totalOf(draft.itens),
          payment: match.choice.id,
        };
        const effects: Effect[] = [{ kind: "close", comanda }];
        return { session, effects };
      },
      go: "comanda_fechada",
    },
  ],
};

const comandaFechada: State = {
  enter: (session, ctx) => {
    const draft = comandaDraft(session);
    const appointment = target(session, ctx);
    if (!draft || !appointment) return { session, messages: [], go: "menu_barbeiro" };
    return {
      session,
      messages: [
        msg("comanda_fechada", {
          nome: appointment.clientName,
          total: totalOf(draft.itens),
          itens: draft.itens.length,
        }),
      ],
    };
  },
  goto: "menu_barbeiro",
};

const comandaFaltou: State = {
  enter: (session, ctx) => {
    const appointment = target(session, ctx);
    return {
      session,
      messages: [msg("comanda_faltou", { nome: appointment?.clientName ?? "" })],
    };
  },
  goto: "menu_barbeiro",
};

// --- o relatório -----------------------------------------------------------

/**
 * Um relatório é sempre o mesmo estado com outro intervalo.
 *
 * O intervalo é calculado na entrada, a partir do relógio, e não guardado no
 * rascunho: perguntar "e o mês?" é uma conta, não uma memória.
 */
function relatorioDe(range: (session: Session, ctx: Ctx) => Range): Enter {
  return (session, ctx) => {
    const periodo = range(session, ctx);
    const numeros = report(ctx.comandas, periodo);

    if (numeros.atendimentos === 0 && numeros.faltas === 0) {
      return {
        session,
        messages: [msg("relatorio_vazio", { de: periodo.from, ate: periodo.to })],
      };
    }

    const linhas = (de: typeof numeros.porServico): Message[] =>
      de.map((linha) =>
        msg("linha_item", {
          nome: linha.name,
          quantidade: linha.quantidade,
          total: linha.total,
        }),
      );
    const pagamentos: Message[] = numeros.porPagamento.map((linha) =>
      msg("linha_pagamento", {
        forma: linha.payment,
        quantidade: linha.quantidade,
        total: linha.total,
      }),
    );

    return {
      session,
      messages: [
        msg("relatorio", {
          de: periodo.from,
          ate: periodo.to,
          faturado: numeros.faturado,
          atendimentos: numeros.atendimentos,
          faltas: numeros.faltas,
          em_servicos: numeros.emServicos,
          em_produtos: numeros.emProdutos,
          servicos: linhas(numeros.porServico),
          produtos: linhas(numeros.porProduto),
          pagamentos,
        }),
      ],
    };
  };
}

const menuRelatorio: State = {
  enter: says(msg("menu_relatorio")),
  on: [
    { match: option(1), go: "relatorio_hoje" },
    { match: option(2), go: "relatorio_semana" },
    { match: option(3), go: "relatorio_mes" },
    {
      // O pedido de dia é um estado só, e o rascunho diz de onde ele veio.
      match: option(4),
      act: (session) => ({ session: { ...session, draft: { ...session.draft, asking: "relatorio" } } }),
      go: "pedir_dia",
    },
  ],
};

const menuBarbeiro: State = {
  enter: (session) => ({ session: clearDraft(session), messages: [msg("menu_barbeiro")] }),
  on: [
    {
      match: option(1),
      act: (session, _match, ctx) => ({
        session: { ...session, draft: { ...session.draft, looking: ctx.now.day } },
      }),
      go: "agenda",
    },
    { match: option(2), go: "pedir_dia" },
    { match: option(3), go: "comandas" },
    { match: option(4), go: "menu_relatorio" },
  ],
};

/** Para onde "voltar" leva do lado do barbeiro. */
const BACK_TARGETS = ["menu_barbeiro", "comanda"];

function backFrom(session: Session): StateName {
  return BARBEIRO.states[session.state]?.back ?? "menu_barbeiro";
}

export const BARBEIRO: Flow = {
  start: "inicio_barbeiro",
  // O barbeiro não fica preso: se ele digitar três coisas que o bot não
  // entende, o lugar para onde mandá-lo é o menu, não um humano — ele é o humano.
  stuck: "menu_barbeiro",
  missLimit: 3,
  global: [
    { match: keyword("menu", "opcoes"), go: "menu_barbeiro" },
    { match: keyword("voltar"), go: backFrom, exits: BACK_TARGETS },
    { match: keyword("sair", "tchau", "encerrar"), go: "despedida_barbeiro" },
  ],
  states: {
    inicio_barbeiro: { enter: silent, on: [{ match: anything, go: "saudacao_barbeiro" }] },
    saudacao_barbeiro: { enter: says(msg("saudacao_barbeiro")), goto: "menu_barbeiro" },
    menu_barbeiro: menuBarbeiro,
    despedida_barbeiro: { enter: says(msg("despedida_barbeiro")), goto: "inicio_barbeiro" },

    agenda,
    pedir_dia: pedirDia,

    comandas,
    nada_a_fechar: { enter: says(msg("nada_a_fechar")), goto: "menu_barbeiro" },
    compareceu,
    comanda,
    servico_extra: servicoExtra,
    produto_extra: produtoExtra,
    escolher_item: escolherItem,
    pedir_valor: pedirValor,
    escolher_pagamento: escolherPagamento,
    comanda_fechada: comandaFechada,
    comanda_faltou: comandaFaltou,

    menu_relatorio: menuRelatorio,
    relatorio_hoje: { enter: relatorioDe((_s, ctx) => dayRange(ctx.now.day)), goto: "menu_barbeiro" },
    relatorio_semana: { enter: relatorioDe((_s, ctx) => weekRange(ctx.now.day)), goto: "menu_barbeiro" },
    relatorio_mes: { enter: relatorioDe((_s, ctx) => monthRange(ctx.now.day)), goto: "menu_barbeiro" },
    relatorio_dia: {
      enter: relatorioDe((session, ctx) => dayRange(looking(session, ctx))),
      goto: "menu_barbeiro",
    },
  },
};
