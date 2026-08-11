import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { flowFor, reply } from "../src/bot/flow.ts";
import { newSession } from "../src/bot/session.ts";
import type { Ctx, Session } from "../src/bot/session.ts";
import type { Appointment } from "../src/shop/agenda.ts";
import { appointmentId } from "../src/shop/agenda.ts";
import type { Comanda } from "../src/shop/comanda.ts";
import type { Catalog, PaymentId } from "../src/shop/shop.ts";
import { SHOP, serviceById, withCatalog } from "../src/shop/shop.ts";
import { hhmm, parseHhmm } from "../src/shop/time.ts";
import type { Db } from "../src/store.ts";
import { emptyDb, write } from "../src/store.ts";
import { say } from "../src/text/say.ts";

/**
 * A conversation is a fixture, not a test written in TypeScript.
 *
 * `>` is the client, `<` is a message key the bot has to emit in that order,
 * `=` is an appointment that must exist in the agenda when the conversation
 * ends, `$` is a comanda that must exist e `~` é uma linha do catálogo — e o
 * catálogo, quando a fixture fala dele, é conferido inteiro. Reading the fixture is reading the
 * flow, which is the point: a flow that cannot be reviewed by a human is a flow
 * nobody reviews.
 *
 * `# phone` é o que escolhe a tabela: um telefone que está em `SHOP.barbers`
 * conversa como barbeiro, e a mesma sintaxe de fixture serve aos dois lados.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

type Fixture = {
  now: { day: string; at: number };
  phone: string;
  seed: Db;
  steps: { client: string; expect: string[] }[];
  agenda: string[];
  comandas: string[];
  catalogo: string[];
};

function parse(source: string): Fixture {
  const fixture: Fixture = {
    now: { day: "2026-08-10", at: 10 * 60 },
    phone: "5511911111111",
    seed: emptyDb(),
    steps: [],
    agenda: [],
    comandas: [],
    catalogo: [],
  };

  for (const line of source.split("\n")) {
    const text = line.trim();
    if (text === "") continue;

    const body = text.slice(1).trim();
    switch (text[0]) {
      case "#": {
        const [directive, ...rest] = body.split(":");
        const value = rest.join(":").trim();
        if (directive === "now") {
          const [day, hour] = value.split(" ");
          fixture.now = { day: day!, at: parseHhmm(hour ?? "00:00")! };
        } else if (directive === "phone") {
          fixture.phone = value;
        } else if (directive === "agenda") {
          fixture.seed.agenda.push(appointmentFrom(value));
        } else if (directive === "comanda") {
          fixture.seed.comandas.push(comandaFrom(value));
        }
        break;
      }
      case ">":
        fixture.steps.push({ client: body, expect: [] });
        break;
      case "<":
        fixture.steps.at(-1)!.expect.push(body);
        break;
      case "=":
        fixture.agenda.push(body);
        break;
      case "$":
        fixture.comandas.push(body);
        break;
      case "~":
        fixture.catalogo.push(body);
        break;
    }
  }
  return fixture;
}

/** `2026-08-11 10:00 corte 5511922222222 Zé` */
function appointmentFrom(value: string): Appointment {
  const [day, hour, serviceId, phone, ...name] = value.split(/\s+/);
  const service = serviceById(SHOP, serviceId!)!;
  const start = parseHhmm(hour!)!;
  const owner = phone ?? "5511900000000";
  return {
    id: appointmentId(owner, day!, start),
    day: day!,
    start,
    minutes: service.minutes,
    serviceId: service.id,
    clientName: name.join(" ") || "Cliente",
    phone: owner,
  };
}

/** `2026-08-10 09:00 corte pix 4500 5511922222222 Zé` */
function comandaFrom(value: string): Comanda {
  const [day, hour, serviceId, pagamento, preco, phone, ...name] = value.split(/\s+/);
  const start = parseHhmm(hour!)!;
  const owner = phone ?? "5511922222222";
  const total = Number(preco ?? 0);
  const faltou = pagamento === "faltou";
  return {
    id: appointmentId(owner, day!, start),
    day: day!,
    start,
    phone: owner,
    clientName: name.join(" ") || "Cliente",
    status: faltou ? "faltou" : "feito",
    itens: faltou
      ? []
      : [{ kind: "servico", id: serviceId!, name: serviceId!, price: total }],
    total: faltou ? 0 : total,
    ...(faltou ? {} : { payment: pagamento as PaymentId }),
    closedAt: { day: day!, at: start },
  };
}

function short(appointment: Appointment): string {
  return `${appointment.day} ${hhmm(appointment.start)} ${appointment.serviceId}`;
}

/** `servico corte 60 4500` e `produto bala 200`, na ordem da lista. */
function catalogLines(catalog: Catalog): string[] {
  return [
    ...catalog.services.map((s) => `servico ${s.id} ${s.minutes} ${s.price}`),
    ...catalog.products.map((p) => `produto ${p.id} ${p.price}`),
  ];
}

/** `2026-08-10 09:00 pix 4500`, ou `2026-08-10 09:00 faltou`. */
function shortComanda(comanda: Comanda): string {
  const fim = comanda.status === "faltou" ? "faltou" : `${comanda.payment} ${comanda.total}`;
  return `${comanda.day} ${hhmm(comanda.start)} ${fim}`;
}

for (const file of readdirSync(join(HERE, "conversas")).sort()) {
  test(`conversa: ${file.replace(".txt", "")}`, () => {
    const fixture = parse(readFileSync(join(HERE, "conversas", file), "utf8"));
    let session: Session = newSession(fixture.phone, flowFor(SHOP, fixture.phone).start);
    let db = fixture.seed;

    for (const [i, step] of fixture.steps.entries()) {
      const ctx: Ctx = {
        now: fixture.now,
        // A barbearia de cada turno é a constante com o catálogo do banco por
        // cima, como no simulador: uma conversa que muda um preço tem que ver o
        // preço novo no turno seguinte.
        shop: withCatalog(SHOP, db.catalog),
        agenda: db.agenda,
        comandas: db.comandas,
      };
      const outcome = reply(session, step.client, ctx);
      session = outcome.session;
      db = write(db, outcome.effects);

      const said = outcome.messages.map((m) => m.key);
      assert.deepEqual(said, step.expect, `passo ${i + 1}, o cliente disse "${step.client}"`);

      // Nothing the bot says may fail to be worded.
      for (const message of outcome.messages) {
        assert.ok(say(message).length > 0, `mensagem vazia: ${message.key}`);
      }
    }

    assert.deepEqual(db.agenda.map(short), fixture.agenda, "a agenda no fim da conversa");
    assert.deepEqual(
      db.comandas.map(shortComanda),
      fixture.comandas,
      "as comandas no fim da conversa",
    );
    if (fixture.catalogo.length > 0) {
      assert.deepEqual(catalogLines(db.catalog), fixture.catalogo, "o catálogo no fim da conversa");
    }
  });
}
