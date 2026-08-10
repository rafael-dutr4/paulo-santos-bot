import test from "node:test";
import assert from "node:assert/strict";

import type { Agenda, Appointment } from "../src/shop/agenda.ts";
import { SHOP, serviceById } from "../src/shop/shop.ts";
import { daysWithSlots, freeSlots, isOpen, overlaps } from "../src/shop/slots.ts";
import { hhmm } from "../src/shop/time.ts";

const corte = serviceById(SHOP, "corte")!;
const corteBarba = serviceById(SHOP, "corte_barba")!;

/** 2026-08-10 is a segunda (closed), 2026-08-11 a terça, 2026-08-15 um sábado. */
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

function times(agenda: Agenda, day = TUESDAY, service = corte, now = MONDAY): string[] {
  return freeSlots(SHOP, agenda, day, service, now).map(hhmm);
}

/** Uma terça sem um minuto livre: 09:00 às 12:00 e 14:00 às 19:00, de meia em meia. */
function fullTuesday(day = TUESDAY): Appointment[] {
  const manha = Array.from({ length: 6 }, (_, i) => booked(540 + i * 30, 30, day));
  const tarde = Array.from({ length: 10 }, (_, i) => booked(840 + i * 30, 30, day));
  return [...manha, ...tarde];
}

test("two intervals overlap when each starts before the other ends", () => {
  assert.ok(overlaps({ start: 540, end: 570 }, { start: 555, end: 585 }));
  assert.ok(overlaps({ start: 540, end: 600 }, { start: 550, end: 560 }));
  assert.ok(!overlaps({ start: 540, end: 570 }, { start: 570, end: 600 }));
});

test("a closed day has no hours at all", () => {
  assert.ok(!isOpen(SHOP, "2026-08-09")); // domingo
  assert.ok(!isOpen(SHOP, "2026-08-10")); // segunda
  assert.ok(!isOpen(SHOP, "2026-09-07")); // feriado numa segunda-feira do calendário do shop
  assert.deepEqual(times([], "2026-08-09"), []);
});

test("an empty day is the whole grid, and the lunch break is just the gap", () => {
  const hours = times([]);
  assert.equal(hours[0], "09:00");
  assert.equal(hours.at(-1), "18:00");
  assert.ok(hours.includes("11:00"));
  assert.ok(!hours.includes("11:15"), "um corte às 11:15 passaria do fechamento das 12:00");
  assert.ok(!hours.includes("13:00"), "o almoço vai até as 14:00");
  assert.ok(hours.includes("14:00"));
});

test("a longer service loses the slots that do not fit before the break", () => {
  const hours = times([], TUESDAY, corteBarba);
  assert.ok(hours.includes("10:00"));
  assert.ok(!hours.includes("10:15"), "corte + barba às 10:15 invadiria o almoço");
});

test("an appointment removes every slot that touches it", () => {
  const hours = times([booked(600, 30)]); // 10:00 às 10:30
  assert.ok(hours.includes("09:00"), "termina exatamente quando o outro começa");
  assert.ok(!hours.includes("09:15"));
  assert.ok(!hours.includes("10:00"));
  assert.ok(!hours.includes("10:15"));
  assert.ok(hours.includes("10:30"));
});

test("today only offers what still has the minimum notice", () => {
  const now = { day: TUESDAY, at: 10 * 60 + 5 };
  const hours = times([], TUESDAY, corte, now);
  assert.equal(hours[0], "10:45"); // 10:05 + 30min de antecedência, subindo para a grade
});

test("a full day offers nothing", () => {
  assert.deepEqual(times(fullTuesday()), []);
});

test("the day list skips the closed days and the full ones", () => {
  const days = daysWithSlots(SHOP, [], corte, MONDAY, 5);
  assert.deepEqual(days, ["2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"]);

  assert.equal(daysWithSlots(SHOP, fullTuesday(), corte, MONDAY, 5)[0], "2026-08-12");
});
