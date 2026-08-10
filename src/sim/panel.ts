/**
 * O painel, que é a razão de valer a pena construir o simulador.
 *
 * Ele mostra o que o motor está pensando (o estado, o rascunho, o que foi
 * oferecido) e deixa mexer no que o motor recebe. O campo mais importante é o
 * relógio: marcar um horário para sexta às 18:00 vira digitar uma data, e não
 * esperar até sexta.
 */

import type { Choice, Session } from "../bot/session.ts";
import type { Agenda } from "../shop/agenda.ts";
import { SHOP, serviceById } from "../shop/shop.ts";
import type { Moment } from "../shop/time.ts";
import { hhmm } from "../shop/time.ts";
import { dia } from "../text/ptbr.ts";
import { browserNow, momentFrom } from "./clock.ts";

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function setClock(moment: Moment): void {
  el<HTMLInputElement>("clock-day").value = moment.day;
  el<HTMLInputElement>("clock-time").value = hhmm(moment.at);
}

/** O que estiver nos campos, ou o relógio do navegador se estiver ilegível. */
export function readClock(): Moment {
  const moment = momentFrom(
    el<HTMLInputElement>("clock-day").value,
    el<HTMLInputElement>("clock-time").value,
  );
  return moment ?? browserNow();
}

export function showSession(session: Session, now: Moment): void {
  el("estado").textContent = session.state;
  el("relogio").textContent = `${dia(now.day)}, ${hhmm(now.at)}`;
  el("sessao").textContent = JSON.stringify(
    {
      nome: session.name ?? null,
      rascunho: session.draft,
      ofertas: session.choices.map(resumo),
      erros_seguidos: session.misses,
    },
    null,
    2,
  );
}

/** As ofertas em uma linha cada: são até trinta e quatro, e o painel é estreito. */
function resumo(choice: Choice): string {
  switch (choice.kind) {
    case "service":
      return choice.id;
    case "day":
      return choice.day;
    case "slot":
      return hhmm(choice.start);
    case "appointment":
      return choice.id;
  }
}

export function showAgenda(agenda: Agenda): void {
  const list = el("agenda");
  list.replaceChildren();

  if (agenda.length === 0) {
    const empty = document.createElement("li");
    empty.className = "vazio";
    empty.textContent = "agenda vazia";
    list.append(empty);
    return;
  }

  for (const appointment of agenda) {
    const item = document.createElement("li");
    const service = serviceById(SHOP, appointment.serviceId);
    item.textContent = `${dia(appointment.day)}, ${hhmm(appointment.start)} · ${
      service?.name ?? appointment.serviceId
    } · ${appointment.clientName}`;
    list.append(item);
  }
}
