/**
 * A ajuda é conferida pelo motor.
 *
 * Cada receita de `src/sim/ajuda.ts` é uma conversa: os passos são digitados em
 * `reply()`, um por turno, e o último turno tem que dizer a mensagem que a
 * receita promete. Uma resposta que mudou de número ou um estado que ganhou uma
 * pergunta a mais derruba o teste, que é o único jeito de uma documentação
 * escrita à mão não envelhecer sozinha.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { flowFor, reply } from "../src/bot/flow.ts";
import { newSession } from "../src/bot/session.ts";
import type { Ctx, Session } from "../src/bot/session.ts";
import { SHOP, withSettings } from "../src/shop/shop.ts";
import type { Db } from "../src/store.ts";
import { emptyDb, write } from "../src/store.ts";
import { say } from "../src/text/say.ts";
import { RECEITAS, RECEITAS_EM } from "../src/sim/ajuda.ts";
import { futuro, historico } from "../src/sim/seed.ts";

const CLIENTE = "5511911111111";
const BARBEIRO = SHOP.barbers[0]!;

for (const receita of RECEITAS) {
  test(`ajuda: ${receita.pergunta}`, () => {
    const phone = receita.quem === "barbeiro" ? BARBEIRO : CLIENTE;
    let db: Db = emptyDb();

    if (receita.semear) {
      const semear = receita.semear === "futuro" ? futuro : historico;
      db = write(db, semear(withSettings(SHOP, db.settings), db, RECEITAS_EM));
    }

    let session: Session = newSession(phone, flowFor(SHOP, phone).start);
    const ctx = (): Ctx => ({
      now: RECEITAS_EM,
      shop: withSettings(SHOP, db.settings),
      agenda: db.agenda,
      comandas: db.comandas,
    });
    const turno = (texto: string): string[] => {
      const outcome = reply(session, texto, ctx());
      session = outcome.session;
      db = write(db, outcome.effects);
      // Nada do que o bot diz pode ficar sem palavra em português.
      for (const message of outcome.messages) assert.ok(say(message).length > 0, message.key);
      return outcome.messages.map((m) => m.key);
    };

    // A precondição roda calada: ela não está escrita na receita, só o que ela
    // deixa pronto.
    for (const texto of receita.antes ?? []) turno(texto);

    let ditas: string[] = [];
    for (const [i, passo] of receita.passos.entries()) {
      ditas = turno(passo.diga);
      assert.ok(
        !ditas.includes("nao_entendi"),
        `passo ${i + 1} ("${passo.diga}") não foi entendido; o bot disse ${ditas.join(", ")}`,
      );
    }

    assert.ok(
      ditas.includes(receita.chega),
      `a receita promete "${receita.chega}" e o último turno disse ${ditas.join(", ")}`,
    );
  });
}

test("toda receita tem passos e uma pergunta", () => {
  for (const receita of RECEITAS) {
    assert.ok(receita.pergunta.endsWith("?"), `não é pergunta: ${receita.pergunta}`);
    assert.ok(receita.passos.length > 0, `sem passos: ${receita.pergunta}`);
    // Uma precondição sem as mensagens que a criam é uma receita que não roda,
    // e uma semeadura conta como as mensagens.
    if (receita.precisa) {
      assert.ok(receita.antes || receita.semear, `precondição sem preparo: ${receita.pergunta}`);
    }
  }
});
