import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { reply } from "../src/bot/flow.ts";
import { newSession } from "../src/bot/session.ts";
import type { Ctx, Session } from "../src/bot/session.ts";
import type { Agenda, Appointment } from "../src/shop/agenda.ts";
import { appointmentId, applyAll } from "../src/shop/agenda.ts";
import { SHOP, serviceById } from "../src/shop/shop.ts";
import { hhmm, parseHhmm } from "../src/shop/time.ts";
import { say } from "../src/text/say.ts";

/**
 * A conversation is a fixture, not a test written in TypeScript.
 *
 * `>` is the client, `<` is a message key the bot has to emit in that order,
 * and `=` is an appointment that must exist in the agenda when the conversation
 * ends. Reading the fixture is reading the flow, which is the point: a flow
 * that cannot be reviewed by a human is a flow nobody reviews.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

type Fixture = {
  now: { day: string; at: number };
  phone: string;
  seed: Agenda;
  steps: { client: string; expect: string[] }[];
  agenda: string[];
};

function parse(source: string): Fixture {
  const fixture: Fixture = {
    now: { day: "2026-08-10", at: 10 * 60 },
    phone: "5511911111111",
    seed: [],
    steps: [],
    agenda: [],
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
          fixture.seed.push(appointmentFrom(value));
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

function short(appointment: Appointment): string {
  return `${appointment.day} ${hhmm(appointment.start)} ${appointment.serviceId}`;
}

for (const file of readdirSync(join(HERE, "conversas")).sort()) {
  test(`conversa: ${file.replace(".txt", "")}`, () => {
    const fixture = parse(readFileSync(join(HERE, "conversas", file), "utf8"));
    let session: Session = { ...newSession(fixture.phone) };
    let agenda = fixture.seed;

    for (const [i, step] of fixture.steps.entries()) {
      const ctx: Ctx = { now: fixture.now, shop: SHOP, agenda };
      const outcome = reply(session, step.client, ctx);
      session = outcome.session;
      agenda = applyAll(agenda, outcome.effects);

      const said = outcome.messages.map((m) => m.key);
      assert.deepEqual(said, step.expect, `passo ${i + 1}, o cliente disse "${step.client}"`);

      // Nothing the bot says may fail to be worded.
      for (const message of outcome.messages) {
        assert.ok(say(message).length > 0, `mensagem vazia: ${message.key}`);
      }
    }

    assert.deepEqual(agenda.map(short), fixture.agenda, "a agenda no fim da conversa");
  });
}
