/**
 * The agenda, and the only two things that can happen to it.
 *
 * The engine never writes here. It returns `Effect[]` describing what should
 * happen, and the shell (the simulator today, a WhatsApp adapter later) applies
 * them. Describing the change instead of performing it is what keeps `reply()`
 * pure and what lets the same conversation run against `localStorage` or
 * against a database without a line changing.
 */

import type { ServiceId } from "./shop.ts";
import type { Day, Minutes, Moment } from "./time.ts";
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
 * Keeping the set at two means the adapter has two cases to implement forever.
 */
export type Effect =
  | { kind: "book"; appointment: Appointment }
  | { kind: "cancel"; id: string };

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

export function apply(agenda: Agenda, effect: Effect): Agenda {
  switch (effect.kind) {
    case "book":
      return sorted([...agenda.filter((a) => a.id !== effect.appointment.id), effect.appointment]);
    case "cancel":
      return agenda.filter((a) => a.id !== effect.id);
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
