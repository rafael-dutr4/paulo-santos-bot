import test from "node:test";
import assert from "node:assert/strict";

import type { Agenda, Appointment } from "../src/shop/agenda.ts";
import type { Shop } from "../src/shop/shop.ts";
import { SHOP, serviceById } from "../src/shop/shop.ts";
import { daysWithSlots, freeSlots, isOpen, overlaps } from "../src/shop/slots.ts";
import { hhmm } from "../src/shop/time.ts";

const corte = serviceById(SHOP, "corte")!;
const progressiva = serviceById(SHOP, "progressiva")!;

/**
 * A barbearia abre direto, das 08:00 às 20:00. O almoço não é regra em lugar
 * nenhum do código — ele é o buraco entre dois intervalos, e quem quer ver esse
 * buraco funcionando usa esta terça aqui, que tem um.
 */
const ALMOCO: Shop = {
  ...SHOP,
  hours: {
    ...SHOP.hours,
    2: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 19 * 60 }],
  },
};

/** 2026-08-10 é uma segunda, 2026-08-11 uma terça, 2026-08-16 um domingo. */
const MONDAY = { day: "2026-08-10", at: 10 * 60 };
const TUESDAY = "2026-08-11";

function booked(start: number, minutes: number, day = TUESDAY): Appointment {
  return {
    id: `x-${day}-${start}`,
    day,
    start,
    minutes,
    serviceId: "corte",
    clientName: "Cliente",
    phone: "5511900000000",
  };
}

function times(
  agenda: Agenda,
  day = TUESDAY,
  service = corte,
  now = MONDAY,
  shop = SHOP,
): string[] {
  return freeSlots(shop, agenda, day, service, now).map(hhmm);
}

/** Um dia sem um minuto livre: das 08:00 às 20:00, de meia em meia. */
function fullDay(day = TUESDAY): Appointment[] {
  return Array.from({ length: 24 }, (_, i) => booked(480 + i * 30, 30, day));
}

test("two intervals overlap when each starts before the other ends", () => {
  assert.ok(overlaps({ start: 540, end: 570 }, { start: 555, end: 585 }));
  assert.ok(overlaps({ start: 540, end: 600 }, { start: 550, end: 560 }));
  assert.ok(!overlaps({ start: 540, end: 570 }, { start: 570, end: 600 }));
});

test("a closed day has no hours at all", () => {
  assert.ok(!isOpen(SHOP, "2026-08-09")); // domingo
  assert.ok(!isOpen(SHOP, "2026-09-07")); // feriado numa segunda-feira, que é dia de abrir
  assert.deepEqual(times([], "2026-08-09"), []);
});

test("an empty day is the whole grid, up to what still fits before closing", () => {
  const hours = times([]);
  assert.equal(hours[0], "08:00");
  assert.equal(hours.at(-1), "19:00");
  assert.ok(hours.includes("13:00"), "o dia é direto, sem almoço");
  assert.ok(!hours.includes("19:30"), "um corte às 19:30 passaria do fechamento das 20:00");
});

test("the lunch break is just the gap between two intervals", () => {
  const hours = times([], TUESDAY, corte, MONDAY, ALMOCO);
  assert.equal(hours[0], "09:00");
  assert.equal(hours.at(-1), "18:00");
  assert.ok(hours.includes("11:00"));
  assert.ok(!hours.includes("11:30"), "um corte às 11:30 passaria do fechamento das 12:00");
  assert.ok(!hours.includes("13:00"), "o almoço vai até as 14:00");
  assert.ok(hours.includes("14:00"));
});

test("a longer service loses the slots that do not fit before the break", () => {
  const hours = times([], TUESDAY, progressiva, MONDAY, ALMOCO);
  assert.ok(hours.includes("10:00"));
  assert.ok(!hours.includes("10:30"), "uma progressiva às 10:30 invadiria o almoço");
});

test("an appointment removes every slot that touches it", () => {
  const hours = times([booked(600, 30)]); // 10:00 às 10:30
  assert.ok(hours.includes("09:00"), "termina exatamente quando o outro começa");
  assert.ok(!hours.includes("09:30"));
  assert.ok(!hours.includes("10:00"));
  assert.ok(hours.includes("10:30"));
});

test("today only offers what still has the minimum notice", () => {
  const now = { day: TUESDAY, at: 10 * 60 + 5 };
  const hours = times([], TUESDAY, corte, now);
  assert.equal(hours[0], "11:00"); // 10:05 + 30min de antecedência, subindo para a grade
});

test("a full day offers nothing", () => {
  assert.deepEqual(times(fullDay()), []);
});

test("the day list skips the closed days and the full ones", () => {
  // De segunda em diante, pulando o domingo 16.
  const days = daysWithSlots(SHOP, [], corte, MONDAY, 7);
  assert.deepEqual(days, [
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-17",
  ]);

  assert.equal(daysWithSlots(SHOP, fullDay(MONDAY.day), corte, MONDAY, 5)[0], "2026-08-11");
});
