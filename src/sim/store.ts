/**
 * A memória do simulador.
 *
 * A sessão é um valor puro, então guardar tudo é um `JSON.stringify`. Uma
 * futura integração troca este arquivo por um banco e nada mais muda.
 */

import { FLOW } from "../bot/flow.ts";
import type { Session } from "../bot/session.ts";
import { newSession } from "../bot/session.ts";
import type { Agenda } from "../shop/agenda.ts";
import type { Bubble } from "./chat.ts";

const KEY = "paulo-santos-bot";

/** Um número qualquer: o simulador é sempre o mesmo cliente. */
export const PHONE = "5511911111111";

export type Saved = {
  session: Session;
  agenda: Agenda;
  transcript: Bubble[];
};

export function empty(): Saved {
  return { session: newSession(PHONE), agenda: [], transcript: [] };
}

export function load(): Saved {
  const raw = localStorage.getItem(KEY);
  if (!raw) return empty();
  try {
    const saved = JSON.parse(raw) as Saved;
    // Uma sessão guardada antes de uma mudança no fluxo pode apontar para um
    // estado que não existe mais. Recomeçar a conversa é melhor do que estourar
    // no primeiro "oi" e deixar a página sem resposta.
    if (!FLOW.states[saved.session.state]) return { ...empty(), agenda: saved.agenda ?? [] };
    return saved;
  } catch {
    return empty();
  }
}

export function save(saved: Saved): void {
  localStorage.setItem(KEY, JSON.stringify(saved));
}
