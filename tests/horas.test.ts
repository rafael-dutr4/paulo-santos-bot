import test from "node:test";
import assert from "node:assert/strict";

import { lerHora } from "../src/text/horas.ts";
import { hhmm } from "../src/shop/time.ts";

/** As candidatas em `hh:mm`, na ordem em que o leitor as prefere. */
const ler = (texto: string): string[] => lerHora(texto).map(hhmm);

test("o relógio escrito com números", () => {
  assert.deepEqual(ler("14:30"), ["14:30"]);
  assert.deepEqual(ler("14h30"), ["14:30"]);
  assert.deepEqual(ler("18h"), ["18:00"]);
  assert.deepEqual(ler("07:00"), ["07:00"], "zero na frente é relógio de 24 horas");
  assert.deepEqual(ler("09h15"), ["09:15"]);
});

test("uma hora de uma a onze cabe duas vezes no dia, e a tarde vem primeiro", () => {
  assert.deepEqual(ler("2"), ["14:00", "02:00"]);
  assert.deepEqual(ler("duas"), ["14:00", "02:00"]);
  // Das oito às onze a manhã é o palpite melhor: ninguém corta cabelo às 23h.
  assert.deepEqual(ler("9"), ["09:00", "21:00"]);
  assert.deepEqual(ler("nove horas"), ["09:00", "21:00"]);
});

test("a hora falada, com os minutos por extenso", () => {
  assert.deepEqual(ler("duas e meia"), ["14:30", "02:30"]);
  assert.deepEqual(ler("tres e quinze"), ["15:15", "03:15"]);
  assert.deepEqual(ler("quatro e um quarto"), ["16:15", "04:15"]);
  assert.deepEqual(ler("dez e vinte e cinco"), ["10:25", "22:25"]);
  assert.deepEqual(ler("nove e quarenta"), ["09:40", "21:40"]);
  assert.deepEqual(ler("14 e 40"), ["14:40"]);
});

test("o período dito na frase resolve a ambiguidade", () => {
  assert.deepEqual(ler("duas da tarde"), ["14:00"]);
  assert.deepEqual(ler("oito da noite"), ["20:00"]);
  assert.deepEqual(ler("nove da manhã"), ["09:00"]);
  assert.deepEqual(ler("as 3 da tarde"), ["15:00"]);
});

test("meio dia e meia noite", () => {
  assert.deepEqual(ler("meio dia"), ["12:00"]);
  assert.deepEqual(ler("meio-dia"), ["12:00"]);
  assert.deepEqual(ler("meio dia e meia"), ["12:30"]);
  assert.deepEqual(ler("meia noite"), ["00:00"]);
});

test("quinze pras duas", () => {
  assert.deepEqual(ler("quinze pras duas"), ["13:45", "01:45"]);
  assert.deepEqual(ler("20 para as 3"), ["14:40", "02:40"]);
});

test("o pedido vem embrulhado em conversa", () => {
  assert.deepEqual(ler("às 14:30"), ["14:30"]);
  assert.deepEqual(ler("pode ser 14:30?"), ["14:30"]);
  assert.deepEqual(ler("quero marcar duas e meia"), ["14:30", "02:30"]);
  assert.deepEqual(ler("prefiro 16h"), ["16:00"]);
});

test("o que não é hora não vira hora", () => {
  assert.deepEqual(ler("amanhã"), []);
  assert.deepEqual(ler("Rafa"), []);
  assert.deepEqual(ler(""), []);
  assert.deepEqual(ler("25:00"), [], "hora que não existe");
  assert.deepEqual(ler("10:99"), [], "minuto que não existe");
});
