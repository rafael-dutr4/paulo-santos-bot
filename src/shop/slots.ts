/**
 * Which hours are free, as an interval subtraction.
 *
 * A free slot is a start time where the whole service fits inside one opening
 * interval and touches nothing already booked. Two ideas do all the work:
 *
 *   containment  start >= open.start && start + minutes <= open.end
 *   overlap      aStart < bEnd && bStart < aEnd
 *
 * The overlap test is the one worth remembering. Two intervals overlap when
 * each one starts before the other ends, and writing it this way needs no case
 * analysis about which comes first.
 */

import type { Agenda } from "./agenda.ts";
import { busyOn } from "./agenda.ts";
import type { Block, Interval, Period, Service, Shop } from "./shop.ts";
import type { Day, Minutes, Moment } from "./time.ts";
import { addDays, weekday } from "./time.ts";

export function openIntervals(shop: Shop, day: Day): Interval[] {
  if (shop.holidays.includes(day)) return [];
  return shop.hours[weekday(day)];
}

export function isOpen(shop: Shop, day: Day): boolean {
  return openIntervals(shop, day).length > 0;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Os pedaços de um dia que o barbeiro travou.
 *
 * Um bloqueio ocupa a cadeira do mesmo jeito que um agendamento ocupa: para a
 * conta de horas livres os dois são um intervalo tomado, e é só isso que
 * `freeSlots` precisa saber sobre eles. Foi por isso que a conta ficou de uma
 * linha, a sobreposição já estava escrita, e faltava só somar mais uma lista
 * de intervalos à que ela subtrai.
 */
export function blockedOn(shop: Shop, day: Day): Interval[] {
  return shop.blocks
    .filter((block) => block.day === day)
    .map(({ start, end }) => ({ start, end }));
}

/** Os bloqueios de hoje para a frente, na ordem. As horas que passaram não interessam. */
export function upcomingBlocks(shop: Shop, now: Moment): Block[] {
  return shop.blocks
    .filter((block) => block.day > now.day || (block.day === now.day && block.end > now.at))
    .sort((a, b) => (a.day === b.day ? a.start - b.start : a.day < b.day ? -1 : 1));
}

/**
 * The free start times for one service on one day.
 *
 * Candidates sit on a grid (`shop.slotStep`) instead of being packed against
 * the previous appointment. A packed agenda answers "9:07, 9:52, 10:23", which
 * no client reads, and it leaves gaps too small for anyone to book. The grid
 * costs a few minutes of chair time and buys a list that looks like a list of
 * hours.
 */
export function freeSlots(
  shop: Shop,
  agenda: Agenda,
  day: Day,
  service: Service,
  now: Moment,
): Minutes[] {
  // O que a cadeira já tem em cima: o que foi prometido a alguém, e o que o
  // barbeiro travou. Para esta conta os dois são a mesma coisa.
  const busy = [...busyOn(agenda, day), ...blockedOn(shop, day)];
  const earliest = day === now.day ? now.at + shop.minNotice : 0;
  const slots: Minutes[] = [];

  for (const open of openIntervals(shop, day)) {
    const first = Math.ceil(open.start / shop.slotStep) * shop.slotStep;
    for (let start = first; start + service.minutes <= open.end; start += shop.slotStep) {
      if (start < earliest) continue;
      const candidate = { start, end: start + service.minutes };
      if (busy.some((taken) => overlaps(candidate, taken))) continue;
      slots.push(start);
    }
  }
  return slots;
}

/**
 * Os horários livres separados por período, sem os períodos vazios.
 *
 * É o que deixa a conversa perguntar "manhã ou tarde?" antes de listar hora por
 * hora: um dia inteiro dá trinta e poucas opções e nenhum cliente lê isso.
 */
export function byPeriod(
  shop: Shop,
  hours: Minutes[],
): { period: Period; hours: Minutes[] }[] {
  return shop.periods
    .map((period) => ({
      period,
      hours: hours.filter((at) => at >= period.from && at < period.to),
    }))
    .filter((group) => group.hours.length > 0);
}

/** The next days that are open and have at least one free slot for this service. */
export function daysWithSlots(
  shop: Shop,
  agenda: Agenda,
  service: Service,
  now: Moment,
  howMany: number,
): Day[] {
  const days: Day[] = [];
  for (let ahead = 0; ahead <= shop.horizonDays && days.length < howMany; ahead++) {
    const day = addDays(now.day, ahead);
    if (freeSlots(shop, agenda, day, service, now).length > 0) days.push(day);
  }
  return days;
}
