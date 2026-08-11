/**
 * O painel, que é a razão de valer a pena construir o simulador.
 *
 * Ele mostra o que o motor está pensando (o estado, o rascunho, o que foi
 * oferecido) e deixa mexer no que o motor recebe. O campo mais importante é o
 * relógio: marcar um horário para sexta às 18:00 vira digitar uma data, e não
 * esperar até sexta.
 */

import type { Choice, Session } from "../bot/session.ts";
import { SHOP, serviceById } from "../shop/shop.ts";
import type { Moment } from "../shop/time.ts";
import { hhmm } from "../shop/time.ts";
import type { Db } from "../store.ts";
import { brl, dia } from "../text/ptbr.ts";
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

/**
 * As duas sessões vivas, lado a lado.
 *
 * São duas porque são duas conversas, e vê-las juntas é meio caminho para
 * entender o desenho: o motor é o mesmo, a tabela é que muda, e cada telefone
 * anda pela sua sem saber da outra.
 */
export function showSession(cliente: Session, barbeiro: Session, now: Moment): void {
  el("relogio").textContent = `${dia(now.day)}, ${hhmm(now.at)}`;
  paintSession("estado", "sessao", cliente);
  paintSession("estado-barbeiro", "sessao-barbeiro", barbeiro);
}

function paintSession(estado: string, sessao: string, session: Session): void {
  el(estado).textContent = session.state;
  el(sessao).textContent = JSON.stringify(
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
    case "product":
    case "appointment":
      return choice.id;
    case "novo":
      return `novo ${choice.what}`;
    case "voltar":
      return "voltar";
    case "weekday":
      return `semana ${choice.weekday}`;
    case "fechados":
      return "dias fechados";
    case "todos":
      return "todos os dias";
    case "item":
      return `item ${choice.index}`;
    case "payment":
      return choice.id;
  }
}

/**
 * O banco inteiro na tela: a agenda, o catálogo e as comandas.
 *
 * São as duas metades do mesmo dia. A agenda é a promessa, e a comanda é o que
 * aconteceu com ela — por isso ficam uma embaixo da outra, e não em telas
 * diferentes.
 */
export function showAgenda(db: Db): void {
  fill("agenda", "agenda vazia", db.agenda, (appointment) => {
    const service = serviceById(SHOP, appointment.serviceId);
    return `${dia(appointment.day)}, ${hhmm(appointment.start)} · ${
      service?.name ?? appointment.serviceId
    } · ${appointment.clientName}`;
  });

  fill("catalogo", "catálogo vazio", [...db.settings.services, ...db.settings.products], (item) =>
    "minutes" in item
      ? `${item.name} · ${item.minutes} min · ${brl(item.price)}`
      : `${item.name} · ${brl(item.price)}`,
  );

  fill("comandas", "nenhuma comanda fechada", db.comandas, (comanda) => {
    const fim =
      comanda.status === "feito"
        ? `${brl(comanda.total)} · ${comanda.payment ?? ""}`
        : "faltou";
    return `${dia(comanda.day)}, ${hhmm(comanda.start)} · ${comanda.clientName} · ${fim}`;
  });
}

function fill<T>(id: string, vazio: string, rows: T[], line: (row: T) => string): void {
  const list = el(id);
  list.replaceChildren();

  if (rows.length === 0) {
    const item = document.createElement("li");
    item.className = "vazio";
    item.textContent = vazio;
    list.append(item);
    return;
  }

  for (const row of rows) {
    const item = document.createElement("li");
    item.textContent = line(row);
    list.append(item);
  }
}
