/**
 * Everything the bot remembers about one conversation.
 *
 * The session is the whole memory of the bot. The simulator keeps one of them,
 * a WhatsApp adapter keeps a map of them by phone number, and neither has to
 * know anything else. It is a plain value, so storing it is `JSON.stringify`.
 */

import type { Agenda } from "../shop/agenda.ts";
import type { ServiceId, Shop } from "../shop/shop.ts";
import type { Day, Minutes, Moment } from "../shop/time.ts";

export type StateName = string;

/**
 * One entry of the numbered list the bot has just presented.
 *
 * This is the part that is easy to get wrong. The client answers `3`, and `3`
 * means nothing on its own: it only means something against the list that was
 * actually shown. So the state that presents a dynamic list stores it here, and
 * the `choice()` matcher resolves the number against it.
 *
 * Because the list lives in the session, a client who answers an old message
 * after a reload cannot book an hour that was never offered to them.
 */
export type Choice =
  | { kind: "service"; id: ServiceId }
  | { kind: "day"; day: Day }
  | { kind: "slot"; start: Minutes }
  | { kind: "appointment"; id: string }
  | { kind: "more" };

/** What is being assembled during a booking. */
export type Draft = {
  serviceId?: ServiceId;
  day?: Day;
  start?: Minutes;
  /** Set while remarcando: the appointment being replaced. */
  replacing?: string;
  /** Which page of hours is on screen. */
  page?: number;
};

export type Session = {
  phone: string;
  state: StateName;
  draft: Draft;
  choices: Choice[];
  /** Consecutive answers the bot did not understand. */
  misses: number;
  /** Remembered between bookings, so a returning client is not asked twice. */
  name?: string;
};

/** The world as the engine sees it: read only, and handed in from outside. */
export type Ctx = {
  now: Moment;
  shop: Shop;
  agenda: Agenda;
};

export function newSession(phone: string): Session {
  return { phone, state: "inicio", draft: {}, choices: [], misses: 0 };
}

/** A new turn always starts from a clean draft. */
export function clearDraft(session: Session): Session {
  return { ...session, draft: {}, choices: [] };
}
