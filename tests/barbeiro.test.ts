import test from "node:test";
import assert from "node:assert/strict";

import { reply } from "../src/bot/flow.ts";
import type { Appointment } from "../src/shop/agenda.ts";
import type { Ctx, Session } from "../src/bot/session.ts";
import { newSession } from "../src/bot/session.ts";
import { BARBEIRO } from "../src/bot/barbeiro.ts";
import { SHOP, withSettings } from "../src/shop/shop.ts";
import { daysWithSlots } from "../src/shop/slots.ts";
import type { Db } from "../src/store.ts";
import { emptyDb, write } from "../src/store.ts";
import { say } from "../src/text/say.ts";

/**
 * O que o barbeiro lê, e não só a chave da mensagem.
 *
 * As fixtures de `conversas/` conferem a ordem das chaves, que é o desenho do
 * fluxo. Aqui o que se confere é o texto: um estado que escreve e mostra no
 * mesmo turno mostrava a foto do mundo tirada antes da escrita, e nenhuma
 * asserção sobre chaves pegaria isso.
 */

const AGORA = { day: "2026-08-11", at: 10 * 60 };
const BARBEIRO_PHONE = SHOP.barbers[0]!;

/** Roda uma conversa inteira e devolve o que foi dito no último turno. */
function conversa(mensagens: string[], agenda: Appointment[] = []): { dito: string; db: Db } {
  let session: Session = newSession(BARBEIRO_PHONE, BARBEIRO.start);
  let db = { ...emptyDb(), agenda };
  let dito = "";

  for (const texto of mensagens) {
    const ctx: Ctx = {
      now: AGORA,
      shop: withSettings(SHOP, db.settings),
      agenda: db.agenda,
      comandas: db.comandas,
    };
    const outcome = reply(session, texto, ctx);
    session = outcome.session;
    db = write(db, outcome.effects);
    dito = outcome.messages.map(say).join("\n");
  }
  return { dito, db };
}

test("o preço novo aparece na lista do mesmo turno em que foi salvo", () => {
  const { dito, db } = conversa(["oi", "5", "1", "1", "55"]);
  assert.match(dito, /Corte · 1h · R\$ 55,00/, "a lista mostrou o preço velho");
  assert.equal(db.settings.services[0]?.price, 5500);
});

test("o produto novo aparece na lista do mesmo turno em que foi criado", () => {
  const { dito, db } = conversa(["oi", "5", "12", "Água de coco", "8,50"]);
  assert.match(dito, /Água de coco · R\$ 8,50/, "a lista não trouxe o que acabou de nascer");
  assert.ok(db.settings.products.some((p) => p.id === "agua_de_coco"));
});

test("o serviço novo nasce com nome, preço e tempo, e o cliente passa a vê-lo", () => {
  const { db } = conversa(["oi", "5", "11", "Sobrancelha", "15", "meia hora"]);
  assert.deepEqual(db.settings.services.at(-1), {
    id: "sobrancelha",
    name: "Sobrancelha",
    minutes: 30,
    price: 1500,
  });
});

test("tirar da lista tira, e a lista do mesmo turno já não mostra", () => {
  // 10 é a bala, a última da prateleira inicial.
  const { dito, db } = conversa(["oi", "5", "10", "2", "sim"]);
  assert.ok(!db.settings.products.some((p) => p.id === "bala"));
  assert.doesNotMatch(dito, /Bala/);
});

test("o produto não tem tempo, e o menu dele é um item mais curto", () => {
  // No serviço: preço, tempo, tirar, voltar. No produto não há tempo, então
  // "tirar" sobe para 2 e o voltar para 3.
  const { dito: servico } = conversa(["oi", "5", "1"]);
  assert.match(servico, /2 - Mudar o tempo/);
  assert.match(servico, /4 - Voltar/);

  const { dito: produto } = conversa(["oi", "5", "10"]);
  assert.doesNotMatch(produto, /Mudar o tempo/);
  assert.match(produto, /3 - Voltar/);
});

test("toda lista termina em voltar, e ele é um passo atrás", () => {
  // O catálogo tem 4 serviços, 6 produtos e as duas linhas de "novo": o 13 é a
  // saída. Atrás do catálogo está o menu.
  const { dito: doSettingso } = conversa(["oi", "5", "13"]);
  assert.match(doSettingso, /1 - Agenda de hoje/);

  // E atrás de um item do catálogo está o catálogo, não o menu: um passo, como
  // a palavra "voltar" sempre fez.
  const { dito: doItem } = conversa(["oi", "5", "1", "4"]);
  assert.match(doItem, /✂️ Serviços/);
});

// --- os dias e o expediente ------------------------------------------------

/** A terça é 2, e 2026-08-11 é uma terça. */
const TERCA = 2;

test("mudar o fechamento reescreve o intervalo, e o almoço continua onde estava", () => {
  const { db } = conversa(["oi", "6", "2", "2", "18:00"]);
  assert.deepEqual(db.settings.hours[TERCA], [
    { start: 9 * 60, end: 12 * 60 },
    { start: 14 * 60, end: 18 * 60 },
  ]);
});

test("dar almoço a um dia direto parte o intervalo em dois", () => {
  // O sábado (6) abre 08:00 às 17:00, sem parar.
  const { db } = conversa(["oi", "6", "6", "3", "12:00", "13:00"]);
  assert.deepEqual(db.settings.hours[6], [
    { start: 8 * 60, end: 12 * 60 },
    { start: 13 * 60, end: 17 * 60 },
  ]);
});

test("tirar o almoço junta os dois num intervalo só", () => {
  const { db } = conversa(["oi", "6", "2", "3", "sem"]);
  assert.deepEqual(db.settings.hours[TERCA], [{ start: 9 * 60, end: 19 * 60 }]);
});

test("abrir depois de fechar não é horário, é engano", () => {
  const { dito, db } = conversa(["oi", "6", "2", "1", "20:00"]);
  assert.match(dito, /Esse horário não fecha/);
  assert.equal(db.settings.hours[TERCA]?.[0]?.start, 9 * 60, "nada foi salvo");
});

test("abrir um dia fechado copia o expediente de um dia que já abre", () => {
  // A segunda (1) é fechada, e a terça é o primeiro dia aberto da semana.
  const { db } = conversa(["oi", "6", "1", "1"]);
  assert.deepEqual(db.settings.hours[1], db.settings.hours[TERCA]);
});

test("fechar um dia da semana com gente marcada é recusado, com os nomes", () => {
  const marcado: Appointment = {
    id: "x",
    day: "2026-08-12", // uma quarta
    start: 9 * 60,
    minutes: 60,
    serviceId: "corte",
    clientName: "Zé",
    phone: "5511922222222",
  };
  // 3 é a quarta-feira, e 4 é "fechar neste dia da semana".
  const { dito, db } = conversa(["oi", "6", "3", "4"], [marcado]);
  assert.match(dito, /esse dia tem horário marcado/);
  assert.match(dito, /Zé/);
  assert.ok(db.settings.hours[3]!.length > 0, "a quarta continua aberta");
});

test("uma data fechada some da agenda do cliente", () => {
  const { db } = conversa(["oi", "6", "8", "4", "15/08"]);
  assert.ok(db.settings.holidays.includes("2026-08-15"));

  // E agora o outro lado do balcão: o dia deixou de existir para quem marca.
  const dias = daysWithSlots(
    withSettings(SHOP, db.settings),
    db.agenda,
    SHOP.services[0]!,
    AGORA,
    10,
  );
  assert.ok(!dias.includes("2026-08-15"), "o sábado fechado ainda aparecia para o cliente");
});

test("reabrir uma data devolve o dia", () => {
  const fechado = conversa(["oi", "6", "8", "4", "15/08"]).db;
  let session: Session = newSession(BARBEIRO_PHONE, BARBEIRO.start);
  let db = fechado;
  for (const texto of ["oi", "6", "8", "1", "sim"]) {
    const ctx: Ctx = {
      now: AGORA,
      shop: withSettings(SHOP, db.settings),
      agenda: db.agenda,
      comandas: db.comandas,
    };
    const outcome = reply(session, texto, ctx);
    session = outcome.session;
    db = write(db, outcome.effects);
  }
  assert.ok(!db.settings.holidays.includes("2026-08-15"));
});
