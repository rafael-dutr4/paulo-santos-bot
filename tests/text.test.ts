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

test("a list param becomes one line per item", () => {
  const text = say(
    msg("escolher_hora", {
      dia: "2026-08-11",
      itens: [msg("item_hora", { n: 1, hora: 540 }), msg("item_hora", { n: 2, hora: 555 })],
    }),
  );
  assert.ok(text.includes("1 - 09:00\n2 - 09:15"), text);
});

test("the opening hours group the days that are the same", () => {
  const text = say(msg("horarios"));
  assert.ok(text.includes("terça-feira a quinta-feira: 09:00 às 12:00 e 13:00 às 19:00"), text);
  assert.ok(text.includes("sexta-feira: 09:00 às 12:00 e 13:00 às 20:00"), text);
  assert.ok(text.includes("sábado: 08:00 às 17:00"), text);
  assert.ok(text.includes("Fechado: segunda-feira e domingo"), text);
});
