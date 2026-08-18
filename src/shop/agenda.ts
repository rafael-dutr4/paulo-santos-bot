/**
 * The agenda, and the only two things that can happen to it.
 *
 * The engine never writes here. It returns `Effect[]` describing what should
 * happen, and the shell (the simulator today, a WhatsApp adapter later) applies
 * them. Describing the change instead of performing it is what keeps `reply()`
 * pure and what lets the same conversation run against `localStorage` or
 * against a database without a line changing.
 */

import type { Comanda } from "./comanda.ts";
import type { Block, Product, Service, ServiceId } from "./shop.ts";
import type { Day, Minutes, Moment, Weekday } from "./time.ts";
import { compare } from "./time.ts";
import type { Interval } from "./shop.ts";

export type Appointment = {
  id: string;
  day: Day;
  start: Minutes;
  /** Copied from the service at booking time, so changing a duration later does not move old appointments. */
  minutes: Minutes;
  serviceId: ServiceId;
  clientName: string;
  phone: string;
};

export type Agenda = Appointment[];

/**
 * Remarcar is not a third effect: it is a cancel and a book in the same turn.
 * Keeping the set small means the adapter has few cases to implement forever.
 *
 * `close` is the one addition the barber's side asks for, and it is here
 * because it is a different write, not a different way of writing the same
 * thing: `book` and `cancel` move a promise in the agenda, `close` records what
 * happened in the comandas. Everything else the barber does is a question.
 */
export type Effect =
  | { kind: "book"; appointment: Appointment }
  | { kind: "cancel"; id: string }
  | { kind: "close"; comanda: Comanda }
  // O catálogo, que o barbeiro edita pela conversa. Salvar cria ou atualiza,
  // pelo id, como `book` faz com o agendamento.
  | { kind: "service"; service: Service }
  | { kind: "product"; product: Product }
  | { kind: "remove"; from: "services" | "products"; id: string }
  // Os dias: o horário de um dia da semana, e as datas em que não se abre.
  | { kind: "hours"; weekday: Weekday; intervals: Interval[] }
  | { kind: "close_day"; day: Day }
  | { kind: "open_day"; day: Day }
  // Um pedaço de um dia, travado e destravado. Como o dia fechado, ele é
  // endereçado pelo que é (o dia e a hora em que começa) e não por um id
  // sorteado, reaplicar o mesmo turno trava o mesmo intervalo, não dois.
  | { kind: "block"; block: Block }
  | { kind: "unblock"; day: Day; start: Minutes };

/**
 * The id is derived from the booking, not generated.
 *
 * A random id would need `Math.random()`, which is banned in the pure modules,
 * and a counter would need state the engine does not have. The same client
 * cannot hold two appointments starting at the same minute, so the phone, the
 * day and the start already identify one. As a bonus, replaying a conversation
 * in a test produces the same ids every time.
 */
export function appointmentId(phone: string, day: Day, start: Minutes): string {
  return `${phone}-${day}-${start}`;
}

/** Fechar uma comanda não mexe na agenda: o horário aconteceu, e continua lá. */
export function apply(agenda: Agenda, effect: Effect): Agenda {
  switch (effect.kind) {
    case "book":
      return sorted([...agenda.filter((a) => a.id !== effect.appointment.id), effect.appointment]);
    case "cancel":
      return agenda.filter((a) => a.id !== effect.id);
    // Nada que não seja um agendamento mexe na agenda: fechar comanda, mudar um
    // preço, travar uma hora e tirar um produto da lista deixam o que está
    // marcado onde está. Um bloqueio nem podia mexer: ele só existe onde não
    // há ninguém marcado, e é o fluxo que recusa o contrário.
    default:
      return agenda;
  }
}

export function applyAll(agenda: Agenda, effects: Effect[]): Agenda {
  return effects.reduce(apply, agenda);
}

/** The intervals a day already has taken. */
export function busyOn(agenda: Agenda, day: Day): Interval[] {
  return agenda
    .filter((a) => a.day === day)
    .map((a) => ({ start: a.start, end: a.start + a.minutes }));
}

/** The appointments of one phone number that have not happened yet. */
export function upcoming(agenda: Agenda, phone: string, now: Moment): Appointment[] {
  return sorted(
    agenda.filter((a) => a.phone === phone && compare({ day: a.day, at: a.start }, now) >= 0),
  );
}

export function byId(agenda: Agenda, id: string): Appointment | null {
  return agenda.find((a) => a.id === id) ?? null;
}

function sorted(agenda: Agenda): Agenda {
  return [...agenda].sort((a, b) =>
    compare({ day: a.day, at: a.start }, { day: b.day, at: b.start }),
  );
}
