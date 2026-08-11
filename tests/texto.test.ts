import test from "node:test";
import assert from "node:assert/strict";

import { lerDia } from "../src/text/datas.ts";
import { lerDinheiro } from "../src/text/dinheiro.ts";
import { lerDuracao } from "../src/text/duracao.ts";

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

test("a duração é lida como o barbeiro fala", () => {
  assert.equal(lerDuracao("30"), 30);
  assert.equal(lerDuracao("30 min"), 30);
  assert.equal(lerDuracao("45 minutos"), 45);
  assert.equal(lerDuracao("1h"), 60);
  assert.equal(lerDuracao("1h30"), 90);
  assert.equal(lerDuracao("1:30"), 90);
  assert.equal(lerDuracao("meia hora"), 30);
  assert.equal(lerDuracao("uma hora e meia"), 90);
});

test("duração e hora do dia são leitores diferentes de propósito", () => {
  // `1h30` como hora do dia é uma e meia da madrugada; como duração é uma hora
  // e meia de cadeira. Quem sabe qual dos dois é a pergunta é o fluxo.
  assert.equal(lerDuracao("1h30"), 90);
  assert.equal(lerDuracao("0"), null, "serviço de zero minuto não existe");
  assert.equal(lerDuracao("amanha"), null);
});

test("as palavras de todo dia são lidas contra o relógio", () => {
  assert.deepEqual(lerDia("hoje", HOJE), ["2026-08-11"]);
  assert.deepEqual(lerDia("ontem", HOJE), ["2026-08-10"]);
  assert.deepEqual(lerDia("anteontem", HOJE), ["2026-08-09"]);
  assert.deepEqual(lerDia("amanha", HOJE), ["2026-08-12"]);
});

test("o nome do dia da semana anda para a frente", () => {
  // HOJE é terça, 11/08.
  assert.equal(lerDia("quinta", HOJE)[0], "2026-08-13");
  assert.equal(lerDia("segunda", HOJE)[0], "2026-08-17", "a segunda que vem, não a que passou");
  assert.equal(lerDia("quinta feira", HOJE)[0], "2026-08-13");
  assert.equal(lerDia("quinta-feira", HOJE)[0], "2026-08-13");
  assert.equal(lerDia("na proxima quinta", HOJE)[0], "2026-08-13");
  assert.equal(lerDia("quinta que vem", HOJE)[0], "2026-08-13");
});

test("dito como passado, o dia da semana anda para trás", () => {
  assert.equal(lerDia("quinta passada", HOJE)[0], "2026-08-06");
  assert.equal(lerDia("ultima quinta", HOJE)[0], "2026-08-06");
  assert.equal(lerDia("sexta passada", HOJE)[0], "2026-08-07");
});

test("o dia de hoje pelo nome é hoje, e o passado dele é a semana anterior", () => {
  assert.equal(lerDia("terca", HOJE)[0], "2026-08-11");
  assert.equal(lerDia("terca passada", HOJE)[0], "2026-08-04");
});

test("uma frase com um dia dentro não é um pedido de dia", () => {
  assert.deepEqual(lerDia("marquei quinta com o cliente", HOJE), []);
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
