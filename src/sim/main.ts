/**
 * O simulador: a casca fina em volta do motor.
 *
 * Um turno é sempre a mesma coisa, e é exatamente o que um adaptador de
 * WhatsApp vai fazer:
 *
 *     mensagem -> reply(session, texto, ctx) -> guardar sessão,
 *                 aplicar efeitos na agenda, mandar as mensagens
 */

import { reply } from "../bot/flow.ts";
import type { Ctx } from "../bot/session.ts";
import { newSession } from "../bot/session.ts";
import type { Agenda, Appointment } from "../shop/agenda.ts";
import { appointmentId, applyAll } from "../shop/agenda.ts";
import { SHOP, serviceById } from "../shop/shop.ts";
import { daysWithSlots, freeSlots } from "../shop/slots.ts";
import type { Moment } from "../shop/time.ts";
import { hhmm } from "../shop/time.ts";
import { say } from "../text/say.ts";
import { append, paint, typing } from "./chat.ts";
import { browserNow } from "./clock.ts";
import { readClock, setClock, showAgenda, showSession } from "./panel.ts";
import type { Saved } from "./store.ts";
import { PHONE, empty, load, save } from "./store.ts";

/** Quanto o bot "digita" entre um balão e outro. */
const DELAY = 550;

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let saved: Saved = load();

function ctx(now: Moment): Ctx {
  return { now, shop: SHOP, agenda: saved.agenda };
}

function store(): void {
  save(saved);
  showSession(saved.session, readClock());
  showAgenda(saved.agenda);
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function send(text: string): Promise<void> {
  const now = readClock();
  const chat = el("chat");

  const mine = { from: "cliente" as const, text, at: hhmm(now.at) };
  saved.transcript.push(mine);
  append(chat, mine);

  const outcome = reply(saved.session, text, ctx(now));
  saved.session = outcome.session;
  saved.agenda = applyAll(saved.agenda, outcome.effects);
  store();

  // Um balão de cada vez, com uma pausa no meio. Uma resposta de três
  // mensagens chega como três mensagens, que é como o WhatsApp se comporta.
  for (const message of outcome.messages) {
    const stop = typing(chat);
    await sleep(DELAY);
    stop();
    const bubble = { from: "bot" as const, text: say(message), at: hhmm(now.at) };
    saved.transcript.push(bubble);
    append(chat, bubble);
    save(saved);
  }
}

/**
 * Enche a agenda com horários de outros clientes, para os horários livres
 * deixarem de ser a grade inteira e o cálculo ficar visível.
 */
function seed(): void {
  const now = readClock();
  const corte = serviceById(SHOP, "corte")!;
  const barba = serviceById(SHOP, "barba")!;
  const days = daysWithSlots(SHOP, saved.agenda, corte, now, 2);
  const novos: Appointment[] = [];

  for (const [i, day] of days.entries()) {
    const service = i === 0 ? corte : barba;
    // Pega horários espalhados pelo dia, não os três primeiros.
    const livres = freeSlots(SHOP, saved.agenda, day, service, now);
    for (const start of [livres[1], livres[Math.floor(livres.length / 2)], livres.at(-2)]) {
      if (start === undefined) continue;
      const phone = "5511922222222";
      novos.push({
        id: appointmentId(phone, day, start),
        day,
        start,
        minutes: service.minutes,
        serviceId: service.id,
        clientName: i === 0 ? "Zé" : "Marcos",
        phone,
      });
    }
  }

  saved.agenda = applyAll(saved.agenda, novos.map((appointment) => ({ kind: "book", appointment })));
  store();
}

function resetConversation(): void {
  saved = { ...saved, session: newSession(PHONE), transcript: [] };
  paint(el("chat"), saved.transcript);
  store();
}

function start(): void {
  setClock(browserNow());
  paint(el("chat"), saved.transcript);
  store();

  el<HTMLFormElement>("composer").addEventListener("submit", (event) => {
    event.preventDefault();
    const field = el<HTMLInputElement>("entrada");
    const text = field.value.trim();
    if (text === "") return;
    field.value = "";
    void send(text);
  });

  el("clock-now").addEventListener("click", () => {
    setClock(browserNow());
    store();
  });
  for (const id of ["clock-day", "clock-time"]) {
    el(id).addEventListener("change", store);
  }

  el("reset").addEventListener("click", resetConversation);
  el("seed").addEventListener("click", seed);
  el("clear-agenda").addEventListener("click", () => {
    saved = { ...saved, agenda: [] };
    store();
  });
  el("reset-tudo").addEventListener("click", () => {
    saved = empty();
    paint(el("chat"), saved.transcript);
    store();
  });
}

start();
