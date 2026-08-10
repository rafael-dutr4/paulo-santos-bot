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
import type { Service } from "../shop/shop.ts";
import { serviceById } from "../shop/shop.ts";
import { daysWithSlots, freeSlots } from "../shop/slots.ts";
import type { Choice, Ctx, Session } from "./session.ts";
import { clearDraft } from "./session.ts";
import type { Enter, Flow, Outcome, State } from "./engine.ts";
import { run, says, silent } from "./engine.ts";
import {
  anyHour,
  anything,
  choice,
  keyword,
  name as aName,
  no,
  offeredHour,
  option,
  yes,
} from "./match.ts";
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

// --- the states ------------------------------------------------------------

const menu: State = {
  // Arriving at the menu ends whatever was being assembled, so a client who
  // gives up halfway through a booking does not carry half a draft around.
  enter: (session) => ({ session: clearDraft(session), messages: [msg("menu")] }),
  on: [
    { match: option(1), go: "escolher_servico" },
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

const escolherServico: State = {
  enter: (session, ctx) => ({
    session: {
      ...session,
      choices: ctx.shop.services.map((service) => ({ kind: "service", id: service.id }) as const),
    },
    messages: [
      msg("escolher_servico", {
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

    return {
      session: {
        ...session,
        choices: days.map((day) => ({ kind: "day", day }) as const),
      },
      messages: [
        msg("escolher_dia", {
          servico: service.name,
          itens: days.map((day, i) => msg("item_dia", { n: i + 1, dia: day })),
        }),
      ],
    };
  },
  exits: ["menu", "sem_horarios"],
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

    // Todos os horários de uma vez, sem numerar. A lista é longa demais para um
    // menu numerado, então o cliente responde com a hora, e as ofertas
    // continuam guardadas para conferir a resposta contra elas.
    const choices: Choice[] = hours.map((start) => ({ kind: "slot", start }));

    return {
      session: { ...session, choices },
      messages: [msg("escolher_hora", { dia: day, horas: hours })],
    };
  },
  exits: ["menu", "escolher_dia"],
  on: [
    {
      match: offeredHour,
      act: (session, match) => ({
        session:
          match.choice?.kind === "slot"
            ? { ...session, draft: { ...session.draft, start: match.choice.start } }
            : session,
      }),
      go: (session) => (session.name ? "confirmar" : "pedir_nome"),
      exits: ["confirmar", "pedir_nome"],
    },
    // Uma hora que dá para ler mas não está livre merece resposta melhor do que
    // "não entendi", e a ordem das transições é o que separa as duas.
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

const meusAgendamentos: State = {
  enter: (session, ctx) => {
    const mine = upcoming(ctx.agenda, session.phone, ctx.now);
    if (mine.length === 0) return { session, messages: [], go: "sem_agendamentos" };

    return {
      session: {
        ...session,
        choices: mine.map((a) => ({ kind: "appointment", id: a.id }) as const),
      },
      messages: [
        msg("meus_agendamentos", {
          itens: mine.map((a, i) =>
            msg("item_agendamento", {
              n: i + 1,
              servico: serviceById(ctx.shop, a.serviceId)?.name ?? a.serviceId,
              dia: a.day,
              hora: a.start,
            }),
          ),
        }),
      ],
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
    { match: option(3), go: "menu" },
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
  start: "inicio",
  stuck: "humano",
  missLimit: 3,
  global: [
    { match: keyword("menu", "voltar", "opcoes"), go: "menu" },
    { match: keyword("sair", "tchau", "encerrar"), go: "despedida" },
  ],
  states: {
    // The bot never speaks first: on WhatsApp the client opens the conversation.
    inicio: { enter: silent, on: [{ match: anything, go: "saudacao" }] },
    saudacao: { enter: says(msg("saudacao")), goto: "menu" },
    menu,

    precos: { enter: says(msg("precos")), goto: "menu" },
    horarios: { enter: says(msg("horarios")), goto: "menu" },
    endereco: { enter: says(msg("endereco")), goto: "menu" },
    humano: { enter: says(msg("humano")), goto: "inicio" },
    despedida: { enter: says(msg("despedida")), goto: "inicio" },

    escolher_servico: escolherServico,
    escolher_dia: escolherDia,
    escolher_hora: escolherHora,
    hora_indisponivel: {
      enter: says(msg("hora_indisponivel")),
      goto: "escolher_hora",
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

/** One turn of the barbershop bot. */
export function reply(session: Session, raw: string, ctx: Ctx): Outcome {
  return run(FLOW, session, raw, ctx);
}
