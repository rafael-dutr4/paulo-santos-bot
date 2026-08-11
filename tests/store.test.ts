import test from "node:test";
import assert from "node:assert/strict";

import type { Appointment } from "../src/shop/agenda.ts";
import type { Comanda } from "../src/shop/comanda.ts";
import { emptyDb, write } from "../src/store.ts";

const APPOINTMENT: Appointment = {
  id: "a1",
  day: "2026-08-11",
  start: 9 * 60,
  minutes: 60,
  serviceId: "corte",
  clientName: "Zé",
  phone: "5511922222222",
};

const COMANDA: Comanda = {
  id: "a1",
  day: "2026-08-11",
  start: 9 * 60,
  phone: "5511922222222",
  clientName: "Zé",
  status: "feito",
  itens: [{ kind: "servico", id: "corte", name: "Corte", price: 4500 }],
  total: 4500,
  payment: "pix",
  closedAt: { day: "2026-08-11", at: 10 * 60 },
};

test("marcar escreve na agenda e não nas comandas", () => {
  const db = write(emptyDb(), [{ kind: "book", appointment: APPOINTMENT }]);
  assert.equal(db.agenda.length, 1);
  assert.deepEqual(db.comandas, []);
});

test("fechar escreve na comanda e deixa a agenda como estava", () => {
  const marcado = write(emptyDb(), [{ kind: "book", appointment: APPOINTMENT }]);
  const fechado = write(marcado, [{ kind: "close", comanda: COMANDA }]);
  assert.deepEqual(fechado.agenda, marcado.agenda, "o horário aconteceu, ele não some");
  assert.equal(fechado.comandas.length, 1);
});

test("fechar duas vezes o mesmo horário substitui, não dobra o caixa", () => {
  const uma = write(emptyDb(), [{ kind: "close", comanda: COMANDA }]);
  const outra = write(uma, [{ kind: "close", comanda: { ...COMANDA, total: 6000 } }]);
  assert.equal(outra.comandas.length, 1);
  assert.equal(outra.comandas[0]?.total, 6000);
});

test("o banco de antes não muda quando o de depois é escrito", () => {
  const antes = write(emptyDb(), [{ kind: "book", appointment: APPOINTMENT }]);
  write(antes, [{ kind: "close", comanda: COMANDA }]);
  assert.deepEqual(antes.comandas, [], "escrever devolve um banco novo");
});
