import test from "node:test";
import assert from "node:assert/strict";

import type { Appointment } from "../src/shop/agenda.ts";
import { appointmentId, applyAll, apply, busyOn, byId, upcoming } from "../src/shop/agenda.ts";

function appointment(day: string, start: number, phone = "5511911111111"): Appointment {
  return {
    id: appointmentId(phone, day, start),
    day,
    start,
    minutes: 30,
    serviceId: "corte",
    clientName: "Rafa",
    phone,
  };
}

test("the id comes from the booking, so the same booking is the same id", () => {
  assert.equal(appointmentId("5511911111111", "2026-08-11", 600), "5511911111111-2026-08-11-600");
  assert.equal(appointment("2026-08-11", 600).id, appointment("2026-08-11", 600).id);
});

test("booking keeps the agenda sorted", () => {
  const agenda = applyAll([], [
    { kind: "book", appointment: appointment("2026-08-12", 540) },
    { kind: "book", appointment: appointment("2026-08-11", 600) },
    { kind: "book", appointment: appointment("2026-08-11", 540) },
  ]);
  assert.deepEqual(agenda.map((a) => `${a.day} ${a.start}`), [
    "2026-08-11 540",
    "2026-08-11 600",
    "2026-08-12 540",
  ]);
});

test("booking the same slot twice does not duplicate it", () => {
  const one = appointment("2026-08-11", 600);
  const agenda = applyAll([], [
    { kind: "book", appointment: one },
    { kind: "book", appointment: { ...one, clientName: "Rafael" } },
  ]);
  assert.equal(agenda.length, 1);
  assert.equal(agenda[0]!.clientName, "Rafael");
});

test("remarcar is a cancel and a book", () => {
  const before = appointment("2026-08-11", 600);
  const after = appointment("2026-08-12", 900);
  const agenda = applyAll([before], [
    { kind: "cancel", id: before.id },
    { kind: "book", appointment: after },
  ]);
  assert.deepEqual(agenda.map((a) => a.id), [after.id]);
});

test("cancelling an id that is not there leaves the agenda alone", () => {
  const agenda = [appointment("2026-08-11", 600)];
  assert.deepEqual(apply(agenda, { kind: "cancel", id: "nao-existe" }), agenda);
});

test("busy intervals are the appointments of that day", () => {
  const agenda = [appointment("2026-08-11", 600), appointment("2026-08-12", 540)];
  assert.deepEqual(busyOn(agenda, "2026-08-11"), [{ start: 600, end: 630 }]);
  assert.deepEqual(busyOn(agenda, "2026-08-13"), []);
});

test("a client only sees the appointments that have not happened yet", () => {
  const mine = [appointment("2026-08-11", 600), appointment("2026-08-13", 540)];
  const other = appointment("2026-08-13", 900, "5511922222222");
  const agenda = [...mine, other];
  const now = { day: "2026-08-11", at: 11 * 60 };

  const list = upcoming(agenda, "5511911111111", now);
  assert.deepEqual(list.map((a) => a.day), ["2026-08-13"]);
  assert.equal(byId(agenda, other.id)?.phone, "5511922222222");
});
