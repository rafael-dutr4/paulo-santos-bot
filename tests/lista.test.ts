import { test } from "node:test";
import assert from "node:assert/strict";

import { lista } from "../src/sim/lista.ts";
import type { Choice } from "../src/bot/session.ts";
import { say } from "../src/text/say.ts";
import { msg } from "../src/bot/message.ts";

const nada: Choice[] = [];

test("o menu vira lista", () => {
  const oferta = lista(say(msg("menu")), nada);
  assert.ok(oferta);
  assert.equal(oferta.titulo, "O que você quer fazer?");
  assert.deepEqual(
    oferta.opcoes.map((o) => o.n),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(oferta.opcoes[0]!.label, "Agendar um horário");
});

test("um menu que abre direto na lista sobe sem título", () => {
  const oferta = lista(say(msg("menu_barbeiro")), nada);
  assert.ok(oferta);
  assert.equal(oferta.titulo, "");
  assert.equal(oferta.opcoes.length, 7);
});

test("a hora continua texto, mesmo cabendo numa lista", () => {
  const texto = ["Horários livres:", "1 - 09:00", "2 - 09:30"].join("\n");
  assert.equal(lista(texto, [{ kind: "slot", start: 540 }]), null);
});

test("uma lista maior que o teto do WhatsApp continua texto", () => {
  const linhas = Array.from({ length: 11 }, (_, i) => `${i + 1} - Item`);
  assert.equal(lista(["Escolhe:", ...linhas].join("\n"), nada), null);
});

test("uma linha numerada solta não é lista", () => {
  const texto = ["O almoço começa que horas?", "", "0 - Sem pausa pra almoço"].join("\n");
  assert.equal(lista(texto, nada), null);
});

test("numeração com buraco não é lista", () => {
  assert.equal(lista(["Escolhe:", "1 - Um", "3 - Três"].join("\n"), nada), null);
});

test("texto sem número nenhum não é lista", () => {
  assert.equal(lista(say(msg("despedida")), nada), null);
});

test("uma opção só não vale o toque", () => {
  assert.equal(lista(["Escolhe:", "1 - Voltar"].join("\n"), nada), null);
});
