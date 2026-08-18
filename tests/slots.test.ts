import test from "node:test";
import assert from "node:assert/strict";

import type { Agenda, Appointment } from "../src/shop/agenda.ts";
import type { Shop } from "../src/shop/shop.ts";
import { SHOP, serviceById } from "../src/shop/shop.ts";
import { blockedOn, daysWithSlots, freeSlots, isOpen, overlaps, upcomingBlocks } from "../src/shop/slots.ts";
import { hhmm } from "../src/shop/time.ts";

const corte = serviceById(SHOP, "corte")!;
const progressiva = serviceById(SHOP, "progressiva")!;

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

function times(agenda: Agenda, day = TUESDAY, service = corte, now = MONDAY): string[] {
  return freeSlots(SHOP, agenda, day, service, now).map(hhmm);
}

/** Um dia sem um minuto livre: 08:00 às 12:00 e 14:00 às 20:00, de meia em meia. */
function fullDay(day = TUESDAY): Appointment[] {
  const manha = Array.from({ length: 8 }, (_, i) => booked(480 + i * 30, 30, day));
  const tarde = Array.from({ length: 12 }, (_, i) => booked(840 + i * 30, 30, day));
  return [...manha, ...tarde];
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

test("an empty day is the whole grid, and the lunch break is just the gap", () => {
  const hours = times([]);
  assert.equal(hours[0], "08:00");
  assert.equal(hours.at(-1), "19:00");
  assert.ok(hours.includes("11:00"));
  assert.ok(!hours.includes("11:30"), "um corte às 11:30 passaria do fechamento das 12:00");
  assert.ok(!hours.includes("13:00"), "o almoço vai até as 14:00");
  assert.ok(hours.includes("14:00"));
  assert.ok(!hours.includes("19:30"), "um corte às 19:30 passaria do fechamento das 20:00");
});

test("a longer service loses the slots that do not fit before the break", () => {
  const hours = times([], TUESDAY, progressiva);
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


// --- as horas travadas -----------------------------------------------------

/** A barbearia com um pedaço de terça travado: 15:00 às 16:00. */
const travada: Shop = { ...SHOP, blocks: [{ day: TUESDAY, start: 15 * 60, end: 16 * 60 }] };

function livres(shop: Shop, service = corte): string[] {
  return freeSlots(shop, [], TUESDAY, service, MONDAY).map(hhmm);
}

test("um bloqueio tira as horas do intervalo travado", () => {
  const antes = livres(SHOP);
  const depois = livres(travada);
  assert.ok(antes.includes("15:00"));
  assert.ok(antes.includes("15:30"));
  assert.ok(!depois.includes("15:00"));
  assert.ok(!depois.includes("15:30"));
});

test("um bloqueio não mexe no resto do dia", () => {
  const perdidas = livres(SHOP).filter((hora) => !livres(travada).includes(hora));
  // Um corte leva uma hora: 14:30 também deixa de caber, porque terminaria
  // dentro do bloqueio. É a mesma sobreposição que um agendamento causa.
  assert.deepEqual(perdidas, ["14:30", "15:00", "15:30"]);
});

test("um bloqueio só vale no dia dele", () => {
  assert.deepEqual(blockedOn(travada, "2026-08-12"), []);
  assert.deepEqual(blockedOn(travada, TUESDAY), [{ start: 900, end: 960 }]);
});

test("um dia que só tem hora livre dentro do bloqueio some da lista de dias", () => {
  // A progressiva leva duas horas e só cabe de manhã ou cedo à tarde; travar a
  // tarde inteira de terça tira a terça dos dias oferecidos.
  const tardeTravada: Shop = {
    ...SHOP,
    blocks: [{ day: TUESDAY, start: 8 * 60, end: 20 * 60 }],
  };
  const dias = daysWithSlots(tardeTravada, [], progressiva, MONDAY, 6);
  assert.ok(!dias.includes(TUESDAY));
});

test("a lista de travados esquece o que já passou", () => {
  const shop: Shop = {
    ...SHOP,
    blocks: [
      { day: "2026-08-09", start: 600, end: 660 },
      { day: MONDAY.day, start: 9 * 60, end: 9 * 60 + 30 },
      { day: TUESDAY, start: 900, end: 960 },
    ],
  };
  // Segunda 10:00: o bloqueio de domingo e o das nove da manhã já acabaram.
  assert.deepEqual(
    upcomingBlocks(shop, MONDAY).map((b) => b.day),
    [TUESDAY],
  );
});
