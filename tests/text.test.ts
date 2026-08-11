import test from "node:test";
import assert from "node:assert/strict";

import type { MessageKey } from "../src/bot/message.ts";
import { msg } from "../src/bot/message.ts";
import { PTBR, brl, dia } from "../src/text/ptbr.ts";
import { say } from "../src/text/say.ts";

/** Chaves que só dizem alguma coisa com o parâmetro que as define. */
const AMOSTRA: Partial<Record<MessageKey, Record<string, string>>> = {
  cabecalho_periodo: { periodo: "manha" },
};

test("every key the engine can name has a sentence", () => {
  // The type `Record<MessageKey, Template>` already guarantees this at compile
  // time. The runtime check is here for the mistake the compiler cannot catch:
  // a template that exists and returns nothing.
  for (const key of Object.keys(PTBR) as MessageKey[]) {
    assert.ok(say(msg(key, AMOSTRA[key])).trim().length > 0, `${key} não diz nada`);
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

test("the hours are one message, numbered straight through the periods", () => {
  const text = say(
    msg("escolher_hora", {
      dia: "2026-08-11",
      itens: [
        msg("cabecalho_periodo", { periodo: "manha" }),
        msg("item_hora", { n: 1, hora: 540 }),
        msg("item_hora", { n: 2, hora: 570 }),
        msg("cabecalho_periodo", { periodo: "tarde" }),
        msg("item_hora", { n: 3, hora: 840 }),
        msg("item_voltar", { n: 4 }),
      ],
    }),
  );
  assert.equal(
    text,
    [
      "Horários livres em terça-feira, 11/08:",
      "",
      "🌅 Manhã",
      "1 - 09:00",
      "2 - 09:30",
      "",
      "☀️ Tarde",
      "3 - 14:00",
      "4 - Voltar",
      "",
      "Responde com o número ou com o horário.",
    ].join("\n"),
  );
});

test("the opening hours group the days that are the same", () => {
  const text = say(msg("horarios"));
  assert.ok(text.includes("terça-feira a quinta-feira: 09:00 às 12:00 e 14:00 às 19:00"), text);
  assert.ok(text.includes("sexta-feira: 09:00 às 12:00 e 14:00 às 20:00"), text);
  assert.ok(text.includes("sábado: 08:00 às 17:00"), text);
  assert.ok(text.includes("Fechado: segunda-feira e domingo"), text);
});
