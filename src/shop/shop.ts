/**
 * Everything the barbershop knows about itself.
 *
 * This is data, not code. The barber changes a price or an opening hour here
 * and no state of the conversation moves, because the flow never hardcodes a
 * service, an hour or a price.
 */

import type { Day, Minutes, Weekday } from "./time.ts";

export type ServiceId = string;

export type Service = {
  id: ServiceId;
  /** What the client reads in the menu. */
  name: string;
  /** How long the chair is taken. */
  minutes: Minutes;
  /** In centavos, so no money is ever held in a float. */
  price: number;
};

/** `[start, end)` in minutes since midnight. */
export type Interval = { start: Minutes; end: Minutes };

export type PeriodId = "manha" | "tarde";

/**
 * Os pedaços do dia, para a conversa não despejar todos os horários de uma vez.
 *
 * As bordas são dado da barbearia porque o fluxo corta os horários por elas. O
 * nome de cada pedaço ("manhã") é texto, e vive em `src/text/ptbr.ts`.
 */
export type Period = { id: PeriodId; from: Minutes; to: Minutes };

export type Shop = {
  name: string;
  barber: string;
  address: string;
  maps: string;
  phone: string;
  services: Service[];
  /**
   * Opening intervals per weekday, indexed by `Weekday` (0 is domingo).
   *
   * The lunch break is not a rule anywhere in the code, it is the gap between
   * two intervals. A day with an empty list is a closed day.
   */
  hours: Record<Weekday, Interval[]>;
  periods: Period[];
  /** Candidate start times sit on this grid. */
  slotStep: Minutes;
  /** How long before an appointment it is still possible to book it. */
  minNotice: Minutes;
  /** How far ahead the agenda is open. */
  horizonDays: number;
  /** Days the shop is closed regardless of the weekday. */
  holidays: Day[];
};

export const SHOP: Shop = {
  name: "Barbearia Paulo Santos",
  barber: "Paulo",
  address: "Rua das Palmeiras, 240, Centro",
  maps: "https://maps.google.com/?q=Rua+das+Palmeiras+240",
  phone: "5511999990000",
  services: [
    { id: "corte", name: "Corte", minutes: 30, price: 4500 },
    { id: "barba", name: "Barba", minutes: 30, price: 3500 },
    { id: "corte_barba", name: "Corte + barba", minutes: 60, price: 7000 },
    { id: "pezinho", name: "Pezinho", minutes: 15, price: 2000 },
  ],
  hours: {
    0: [], // domingo, fechado
    1: [], // segunda, fechado
    2: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 19 * 60 }],
    3: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 19 * 60 }],
    4: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 19 * 60 }],
    5: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 20 * 60 }],
    6: [{ start: 8 * 60, end: 17 * 60 }], // sábado, direto
  },
  periods: [
    { id: "manha", from: 0, to: 12 * 60 },
    { id: "tarde", from: 12 * 60, to: 24 * 60 },
  ],
  slotStep: 15,
  minNotice: 30,
  horizonDays: 14,
  holidays: ["2026-09-07", "2026-12-25", "2027-01-01"],
};

export function serviceById(shop: Shop, id: ServiceId): Service | null {
  return shop.services.find((service) => service.id === id) ?? null;
}
