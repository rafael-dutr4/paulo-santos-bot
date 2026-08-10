import test from "node:test";
import assert from "node:assert/strict";

import {
  anyHour,
  anything,
  choice,
  nearestHour,
  offeredHour,
  input,
  keyword,
  leadingNumber,
  name,
  no,
  normalize,
  option,
  yes,
} from "../src/bot/match.ts";
import type { Ctx, Session } from "../src/bot/session.ts";
import { newSession } from "../src/bot/session.ts";
import { SHOP } from "../src/shop/shop.ts";

const ctx: Ctx = { now: { day: "2026-08-10", at: 600 }, shop: SHOP, agenda: [] };
const session: Session = newSession("5511911111111");

const match = (matcher: ReturnType<typeof option>, text: string, s: Session = session) =>
  matcher(input(text), s, ctx);

test("accents, case and punctuation disappear before anything is matched", () => {
  assert.equal(normalize("  NÃO!  "), "nao");
  assert.equal(normalize("Terça-feira"), "terca-feira");
  assert.equal(normalize("é   isso"), "e isso");
});

test("the number has to be at the start of the message", () => {
  assert.equal(leadingNumber("2"), 2);
  assert.equal(leadingNumber("2) essa"), 2);
  assert.equal(leadingNumber("opcao 3"), 3);
  assert.equal(leadingNumber("quero a 2"), null);
  assert.equal(leadingNumber("obrigado"), null);
  // Um horário não é uma opção, senão 09:00 viraria a nona linha da lista.
  assert.equal(leadingNumber("09:00"), null);
  assert.equal(leadingNumber("9h30"), null);
});

test("an option only claims its own number", () => {
  assert.ok(match(option(1), "1"));
  assert.ok(match(option(1), "1 - agendar"));
  assert.equal(match(option(1), "2"), null);
});

test("a number means nothing without the list that was offered", () => {
  const offered: Session = {
    ...session,
    choices: [
      { kind: "slot", start: 540 },
      { kind: "slot", start: 570 },
      { kind: "day", day: "2026-08-11" },
    ],
  };
  assert.deepEqual(match(choice("slot"), "2", offered)?.choice, { kind: "slot", start: 570 });
  // The same "3" belongs to another transition, because it is another kind.
  assert.equal(match(choice("slot"), "3", offered), null);
  assert.deepEqual(match(choice("day"), "3", offered)?.choice, { kind: "day", day: "2026-08-11" });
  // Out of the list, and out of an empty list.
  assert.equal(match(choice("slot"), "9", offered), null);
  assert.equal(match(choice("slot"), "1"), null);
});

test("a typed hour is still checked against what was offered", () => {
  const offered: Session = {
    ...session,
    choices: [{ kind: "slot", start: 540 }, { kind: "slot", start: 870 }],
  };
  assert.deepEqual(match(offeredHour, "14:30", offered)?.choice, { kind: "slot", start: 870 });
  assert.deepEqual(match(offeredHour, "14h30", offered)?.choice, { kind: "slot", start: 870 });
  assert.deepEqual(match(offeredHour, "às 14:30", offered)?.choice, { kind: "slot", start: 870 });
  assert.deepEqual(match(offeredHour, "quero 9h", offered)?.choice, { kind: "slot", start: 540 });

  // Legível, mas não está na lista: outra transição responde melhor que "não entendi".
  assert.equal(match(offeredHour, "07:00", offered), null);
  assert.equal(match(anyHour, "07:00", offered)?.number, 420);
  assert.equal(match(anyHour, "amanhã", offered), null);
});

test("the nearest free hour rescues a time the grid does not have", () => {
  const offered: Session = {
    ...session,
    choices: [
      { kind: "slot", start: 870 }, // 14:30
      { kind: "slot", start: 885 }, // 14:45
    ],
  };
  // 14:40 não existe numa grade de quinze em quinze, e 14:45 está a cinco minutos.
  assert.deepEqual(match(nearestHour, "14 e 40", offered)?.choice, { kind: "slot", start: 885 });
  assert.equal(match(nearestHour, "14 e 40", offered)?.number, 880, "o pedido original é guardado");

  // Longe demais para chamar de "o mais perto que eu tenho".
  assert.equal(match(nearestHour, "09:00", offered), null);
  assert.equal(match(nearestHour, "Rafa", offered), null);
});

test("an option is not an hour, and an hour is not an option", () => {
  const offered: Session = {
    ...session,
    choices: Array.from({ length: 20 }, (_, i) => ({ kind: "slot", start: 540 + i * 15 }) as const),
  };
  // "14 e 40" começa com 14, que também é o número de uma linha da lista.
  assert.equal(match(choice("slot"), "14 e 40", offered), null);
  assert.equal(match(choice("slot"), "8 da noite", offered), null);
  // Um número solto continua sendo a linha da lista.
  assert.deepEqual(match(choice("slot"), "14", offered)?.choice, { kind: "slot", start: 735 });
});

test("a keyword matches whole words only", () => {
  assert.ok(match(keyword("menu"), "menu"));
  assert.ok(match(keyword("menu"), "volta pro menu por favor"));
  assert.equal(match(keyword("menu"), "menusinho"), null);
});

test("sim and não", () => {
  assert.ok(match(yes, "sim"));
  assert.ok(match(yes, "Isso mesmo"));
  assert.ok(match(yes, "pode confirmar"));
  assert.ok(match(no, "não"));
  assert.ok(match(no, "nao, melhor não"));
  assert.equal(match(yes, "talvez"), null);
});

test("anything takes what was typed, a name refuses a number", () => {
  assert.equal(match(anything, "qualquer coisa")?.text, "qualquer coisa");
  assert.equal(match(anything, "   "), null);
  assert.equal(match(name, "Rafa")?.text, "Rafa");
  assert.equal(match(name, "2"), null);
  assert.equal(match(name, "14:15"), null, "quem responde uma hora aqui errou a pergunta");
  assert.equal(match(name, "x".repeat(61)), null);
});
