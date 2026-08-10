import test from "node:test";
import assert from "node:assert/strict";

import type { MessageKey } from "../src/bot/message.ts";
import { msg } from "../src/bot/message.ts";
import { PTBR, brl, dia } from "../src/text/ptbr.ts";
import { say } from "../src/text/say.ts";

test("every key the engine can name has a sentence", () => {
  // The type `Record<MessageKey, Template>` already guarantees this at compile
  // time. The runtime check is here for the mistake the compiler cannot catch:
  // a template that exists and returns nothing.
  for (const key of Object.keys(PTBR) as MessageKey[]) {
    assert.ok(say(msg(key)).trim().length > 0, `${key} não diz nada`);
  }
});

test("money is an integer of centavos until the moment it is written", () => {
  assert.equal(brl(4500), "R$ 45,00");
  assert.equal(brl(3550), "R$ 35,50");
  assert.equal(brl(2005), "R$ 20,05");
});

test("a day is written the way the client reads it", () => {
  assert.equal(dia("2026-08-11"), "terça-feira, 11/08");
  assert.equal(dia("2026-08-15"), "sábado, 15/08");
});

test("a list of messages becomes one line per item", () => {
  const text = say(
    msg("escolher_servico", {
      itens: [
        msg("item_servico", { n: 1, nome: "Corte", minutos: 30, preco: 4500 }),
        msg("item_servico", { n: 2, nome: "Barba", minutos: 30, preco: 3500 }),
      ],
    }),
  );
  assert.ok(text.includes("1 - Corte (30 min, R$ 45,00)\n2 - Barba"), text);
});

test("a period says its name and the range it covers", () => {
  const text = say(
    msg("escolher_periodo", {
      dia: "2026-08-11",
      itens: [
        msg("item_periodo", { n: 1, periodo: "manha", de: 540, ate: 690, quantos: 11 }),
        msg("item_periodo", { n: 2, periodo: "noite", de: 960, ate: 1110, quantos: 11 }),
      ],
    }),
  );
  assert.ok(text.includes("Para terça-feira, 11/08"), text);
  assert.ok(text.includes("1 - 🌅 Manhã (09:00 às 11:30)"), text);
  assert.ok(text.includes("2 - 🌙 Noite (16:00 às 18:30)"), text);
});

test("the hours of a period are numbered", () => {
  const text = say(
    msg("escolher_hora", {
      dia: "2026-08-11",
      periodo: "manha",
      itens: [msg("item_hora", { n: 1, hora: 540 }), msg("item_hora", { n: 2, hora: 555 })],
    }),
  );
  assert.ok(text.includes("Horários livres na manhã de terça-feira, 11/08"), text);
  assert.ok(text.includes("1 - 09:00\n2 - 09:15"), text);
  assert.ok(text.includes("número ou com o horário"), text);
});

test("the opening hours group the days that are the same", () => {
  const text = say(msg("horarios"));
  assert.ok(text.includes("terça-feira a quinta-feira: 09:00 às 12:00 e 13:00 às 19:00"), text);
  assert.ok(text.includes("sexta-feira: 09:00 às 12:00 e 13:00 às 20:00"), text);
  assert.ok(text.includes("sábado: 08:00 às 17:00"), text);
  assert.ok(text.includes("Fechado: segunda-feira e domingo"), text);
});
