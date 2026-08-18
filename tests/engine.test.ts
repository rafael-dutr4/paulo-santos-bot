import test from "node:test";
import assert from "node:assert/strict";

import type { Flow } from "../src/bot/engine.ts";
import { run, says, silent } from "../src/bot/engine.ts";
import { FLOW, reply } from "../src/bot/flow.ts";
import { anything, keyword, option } from "../src/bot/match.ts";
import { msg } from "../src/bot/message.ts";
import type { Ctx, Session } from "../src/bot/session.ts";
import { newSession } from "../src/bot/session.ts";
import type { Agenda } from "../src/shop/agenda.ts";
import { applyAll } from "../src/shop/agenda.ts";
import { SHOP } from "../src/shop/shop.ts";

const ctx = (agenda: Agenda = []): Ctx => ({
  now: { day: "2026-08-10", at: 10 * 60 },
  shop: SHOP,
  agenda,
});

/**
 * A toy flow, to show that the interpreter really does not know what a
 * barbershop is. Everything below is exercised with these three states.
 */
const TOY: Flow = {
  start: "inicio",
  stuck: "socorro",
  missLimit: 3,
  global: [{ match: keyword("menu"), go: "menu" }],
  states: {
    inicio: { enter: silent, on: [{ match: anything, go: "menu" }] },
    menu: {
      enter: says(msg("menu")),
      on: [
        { match: option(1), go: "eco" },
        { match: option(2), go: "aviso" },
      ],
      fallback: msg("nao_entendi"),
    },
    // Says its piece and walks straight back, so one message produces two.
    aviso: { enter: says(msg("precos")), goto: "menu" },
    eco: {
      enter: (session) => ({ session, messages: [msg("pedir_nome")] }),
      on: [{ match: anything, go: "menu" }],
    },
    socorro: { enter: says(msg("humano")), goto: "inicio" },
  },
};

const toy = (session: Session, text: string) => run(TOY, session, text, ctx());

test("a state with goto answers with two messages", () => {
  let session = newSession("1");
  session = toy(session, "oi").session;
  const outcome = toy(session, "2");
  assert.deepEqual(outcome.messages.map((m) => m.key), ["precos", "menu"]);
  assert.equal(outcome.session.state, "menu");
});

test("the fallback repeats the question by re-entering the state", () => {
  let session = newSession("1");
  session = toy(session, "oi").session;
  const outcome = toy(session, "banana");
  assert.deepEqual(outcome.messages.map((m) => m.key), ["nao_entendi", "menu"]);
  assert.equal(outcome.session.state, "menu");
  assert.equal(outcome.session.misses, 1);
});

test("three misses in a row hand the client over", () => {
  let session = newSession("1");
  session = toy(session, "oi").session;
  session = toy(session, "banana").session;
  session = toy(session, "banana").session;
  const outcome = toy(session, "banana");
  assert.deepEqual(outcome.messages.map((m) => m.key), ["humano"]);
  assert.equal(outcome.session.misses, 0);
});

test("an answer that lands resets the miss counter", () => {
  let session = newSession("1");
  session = toy(session, "oi").session;
  session = toy(session, "banana").session;
  assert.equal(session.misses, 1);
  session = toy(session, "1").session;
  assert.equal(session.misses, 0);
});

test("a global rule wins over the state's own transitions", () => {
  let session = newSession("1");
  session = toy(session, "oi").session;
  session = toy(session, "1").session;
  assert.equal(session.state, "eco");
  // `eco` accepts anything, but the global rule is tried first.
  const outcome = toy(session, "menu");
  assert.deepEqual(outcome.messages.map((m) => m.key), ["menu"]);
});

test("an unknown state name is a bug in the table, and it says so", () => {
  const broken = { ...newSession("1"), state: "nao_existe" };
  assert.throws(() => toy(broken, "oi"), /estado desconhecido/);
});

/**
 * The one race a booking bot always has: the hour was free when it was offered
 * and taken when the client answered "sim". The check runs again at the
 * confirmation, against the agenda of that moment.
 */
test("an hour taken between the offer and the sim is not booked", () => {
  let session = newSession("5511911111111");
  let agenda: Agenda = [];
  for (const text of ["oi", "1", "1", "1", "1", "15:00", "Rafa"]) {
    const outcome = reply(session, text, ctx(agenda));
    session = outcome.session;
    agenda = applyAll(agenda, outcome.effects);
  }
  assert.equal(session.state, "confirmar");

  // Someone else takes 09:00 on the same day, in the meantime.
  const stolen: Agenda = [
    {
      id: "outro",
      day: session.draft.day!,
      start: session.draft.start!,
      minutes: 30,
      serviceId: "corte",
      clientName: "Outro",
      phone: "5511999999999",
    },
  ];

  const outcome = reply(session, "sim", ctx(stolen));
  assert.deepEqual(outcome.messages.map((m) => m.key), ["slot_ocupado", "escolher_hora"]);
  assert.deepEqual(outcome.effects, [], "nada pode ser reservado em cima de outro");
  assert.equal(outcome.session.state, "escolher_hora");
});

test("the real flow starts silent, because on WhatsApp the client speaks first", () => {
  const session = newSession("5511911111111");
  assert.equal(session.state, FLOW.start);
  // Uma mensagem só: a saudação já traz o menu, para o bot não falar duas vezes
  // seguidas enquanto quem chegou espera para poder responder.
  assert.deepEqual(reply(session, "oi", ctx()).messages.map((m) => m.key), ["saudacao"]);
});
