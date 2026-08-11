import test from "node:test";
import assert from "node:assert/strict";

import { reply } from "../src/bot/flow.ts";
import type { Ctx, Session } from "../src/bot/session.ts";
import { newSession } from "../src/bot/session.ts";
import { BARBEIRO } from "../src/bot/barbeiro.ts";
import { SHOP, withCatalog } from "../src/shop/shop.ts";
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
function conversa(mensagens: string[]): { dito: string; db: Db } {
  let session: Session = newSession(BARBEIRO_PHONE, BARBEIRO.start);
  let db = emptyDb();
  let dito = "";

  for (const texto of mensagens) {
    const ctx: Ctx = {
      now: AGORA,
      shop: withCatalog(SHOP, db.catalog),
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
  assert.equal(db.catalog.services[0]?.price, 5500);
});

test("o produto novo aparece na lista do mesmo turno em que foi criado", () => {
  const { dito, db } = conversa(["oi", "5", "12", "Água de coco", "8,50"]);
  assert.match(dito, /Água de coco · R\$ 8,50/, "a lista não trouxe o que acabou de nascer");
  assert.ok(db.catalog.products.some((p) => p.id === "agua_de_coco"));
});

test("o serviço novo nasce com nome, preço e tempo, e o cliente passa a vê-lo", () => {
  const { db } = conversa(["oi", "5", "11", "Sobrancelha", "15", "meia hora"]);
  assert.deepEqual(db.catalog.services.at(-1), {
    id: "sobrancelha",
    name: "Sobrancelha",
    minutes: 30,
    price: 1500,
  });
});

test("tirar da lista tira, e a lista do mesmo turno já não mostra", () => {
  // 10 é a bala, a última da prateleira inicial.
  const { dito, db } = conversa(["oi", "5", "10", "2", "sim"]);
  assert.ok(!db.catalog.products.some((p) => p.id === "bala"));
  assert.doesNotMatch(dito, /Bala/);
});

test("o produto não tem tempo, e a opção de serviço não vale para ele", () => {
  // No produto, 2 é "tirar da lista"; 3 não existe e cai no não entendi.
  const { dito } = conversa(["oi", "5", "10", "3"]);
  assert.match(dito, /Não entendi/);
});
