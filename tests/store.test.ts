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

test("salvar um serviço cria pelo id, e o segundo salvar atualiza no lugar", () => {
  const novo = { id: "relaxamento", name: "Relaxamento", minutes: 30, price: 1500 };
  const db = write(emptyDb(), [{ kind: "service", service: novo }]);
  assert.equal(db.settings.services.at(-1)?.id, "relaxamento");

  const caro = write(db, [{ kind: "service", service: { ...novo, price: 2000 } }]);
  assert.equal(caro.settings.services.length, db.settings.services.length, "não duplicou");
  assert.equal(caro.settings.services.at(-1)?.price, 2000);
});

test("um preço novo não muda o lugar do serviço na lista", () => {
  const db = emptyDb();
  const corte = db.settings.services[0]!;
  const depois = write(db, [{ kind: "service", service: { ...corte, price: 9900 } }]);
  assert.equal(depois.settings.services[0]?.id, corte.id, "o corte continua sendo o primeiro");
  assert.equal(depois.settings.services[0]?.price, 9900);
});

test("tirar da lista não mexe em comanda nenhuma", () => {
  const comandado = write(emptyDb(), [{ kind: "close", comanda: COMANDA }]);
  const db = write(comandado, [{ kind: "remove", from: "services", id: "corte" }]);
  assert.ok(!db.settings.services.some((s) => s.id === "corte"));
  assert.deepEqual(db.comandas, comandado.comandas, "o que aconteceu, aconteceu");
});

test("o banco de antes não muda quando o de depois é escrito", () => {
  const antes = write(emptyDb(), [{ kind: "book", appointment: APPOINTMENT }]);
  write(antes, [{ kind: "close", comanda: COMANDA }]);
  assert.deepEqual(antes.comandas, [], "escrever devolve um banco novo");
});
