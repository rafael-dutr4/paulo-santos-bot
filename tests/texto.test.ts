import test from "node:test";
import assert from "node:assert/strict";

import { lerDia } from "../src/text/datas.ts";
import { lerDinheiro } from "../src/text/dinheiro.ts";

const HOJE = "2026-08-11"; // uma terça

test("um número sem casas é reais, nunca centavos", () => {
  assert.equal(lerDinheiro("45"), 4500);
  assert.equal(lerDinheiro("0"), 0);
});

test("o valor vem como o barbeiro digita, com ou sem enfeite", () => {
  assert.equal(lerDinheiro("45,50"), 4550);
  assert.equal(lerDinheiro("45.50"), 4550);
  assert.equal(lerDinheiro("r$ 45"), 4500);
  assert.equal(lerDinheiro("r$45,90"), 4590);
  assert.equal(lerDinheiro("45 reais"), 4500);
});

test("uma casa depois da vírgula é décimo de real", () => {
  assert.equal(lerDinheiro("45,5"), 4550);
});

test("o que não é valor não vira valor", () => {
  assert.equal(lerDinheiro("pix"), null);
  assert.equal(lerDinheiro(""), null);
  assert.equal(lerDinheiro("45 pila"), null);
});

test("as palavras de todo dia são lidas contra o relógio", () => {
  assert.deepEqual(lerDia("hoje", HOJE), ["2026-08-11"]);
  assert.deepEqual(lerDia("ontem", HOJE), ["2026-08-10"]);
  assert.deepEqual(lerDia("anteontem", HOJE), ["2026-08-09"]);
  assert.deepEqual(lerDia("amanha", HOJE), ["2026-08-12"]);
});

test("uma data sem ano cai no ano mais perto de hoje", () => {
  assert.equal(lerDia("10/08", HOJE)[0], "2026-08-10");
  // Lida em janeiro, uma data de dezembro é o dezembro que passou.
  assert.equal(lerDia("28/12", "2027-01-05")[0], "2026-12-28");
});

test("o ano escrito manda, e o dia do computador também é lido", () => {
  assert.deepEqual(lerDia("10/08/2025", HOJE), ["2025-08-10"]);
  assert.deepEqual(lerDia("10/08/25", HOJE), ["2025-08-10"]);
  assert.deepEqual(lerDia("2025-08-10", HOJE), ["2025-08-10"]);
});

test("um dia que não existe não é lido", () => {
  assert.deepEqual(lerDia("30/02", HOJE), []);
  assert.deepEqual(lerDia("qualquer coisa", HOJE), []);
  assert.deepEqual(lerDia("", HOJE), []);
});
