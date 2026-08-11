import test from "node:test";
import assert from "node:assert/strict";

import type { Appointment } from "../src/shop/agenda.ts";
import { appointmentId } from "../src/shop/agenda.ts";
import type { Comanda } from "../src/shop/comanda.ts";
import { between, isClosed, itemsFor, pending, totalOf } from "../src/shop/comanda.ts";
import { SHOP } from "../src/shop/shop.ts";

const PHONE = "5511922222222";

function appointment(day: string, start: number, serviceId = "corte"): Appointment {
  return {
    id: appointmentId(PHONE, day, start),
    day,
    start,
    minutes: 60,
    serviceId,
    clientName: "Zé",
    phone: PHONE,
  };
}

function comanda(day: string, start: number, total = 4500): Comanda {
  return {
    id: appointmentId(PHONE, day, start),
    day,
    start,
    phone: PHONE,
    clientName: "Zé",
    status: "feito",
    itens: [{ serviceId: "corte", price: total }],
    total,
    payment: "pix",
    closedAt: { day, at: start },
  };
}

test("a comanda nasce com o serviço agendado, pelo preço de tabela", () => {
  const itens = itemsFor(SHOP, appointment("2026-08-11", 9 * 60));
  assert.deepEqual(itens, [{ serviceId: "corte", price: 4500 }]);
  assert.equal(totalOf(itens), 4500);
});

test("o total é a soma das linhas, e nada além delas", () => {
  assert.equal(totalOf([]), 0);
  assert.equal(totalOf([{ serviceId: "corte", price: 4000 }, { serviceId: "pezinho", price: 2000 }]), 6000);
});

test("pendente é o que já começou e ninguém fechou", () => {
  const agenda = [
    appointment("2026-08-11", 9 * 60),
    appointment("2026-08-11", 14 * 60),
    appointment("2026-08-12", 9 * 60),
  ];
  const agora = { day: "2026-08-11", at: 15 * 60 };

  const abertas = pending(agenda, [], agora).map((a) => a.start);
  assert.deepEqual(abertas, [9 * 60, 14 * 60], "o de amanhã não entra");

  const fechada = comanda("2026-08-11", 9 * 60);
  assert.deepEqual(
    pending(agenda, [fechada], agora).map((a) => a.start),
    [14 * 60],
    "o que tem comanda sai da lista",
  );
  assert.ok(isClosed([fechada], fechada.id));
});

test("um horário que começa agora já pode ser fechado", () => {
  const agenda = [appointment("2026-08-11", 14 * 60)];
  const agora = { day: "2026-08-11", at: 14 * 60 };
  assert.equal(pending(agenda, [], agora).length, 1);
});

test("o intervalo pega as duas pontas", () => {
  const comandas = [
    comanda("2026-08-09", 9 * 60),
    comanda("2026-08-10", 9 * 60),
    comanda("2026-08-16", 9 * 60),
    comanda("2026-08-17", 9 * 60),
  ];
  assert.deepEqual(
    between(comandas, "2026-08-10", "2026-08-16").map((c) => c.day),
    ["2026-08-10", "2026-08-16"],
  );
});
