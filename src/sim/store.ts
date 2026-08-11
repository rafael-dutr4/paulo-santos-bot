/**
 * A memória do simulador: o `Store` da porta, implementado em `localStorage`.
 *
 * Tudo aqui é um `JSON.stringify` porque tudo acima daqui é valor puro — a
 * sessão, a agenda, a comanda. Uma futura integração troca este arquivo por um
 * banco de verdade, implementa as mesmas quatro operações de `src/store.ts`, e
 * nada do motor nem do fluxo fica sabendo.
 *
 * A partir da conversa do barbeiro existe mais de uma sessão viva ao mesmo
 * tempo, então elas ficam num mapa por telefone. É exatamente o que o adaptador
 * de WhatsApp vai precisar, com a diferença de que lá o mapa tem mil clientes.
 *
 * O `Store` recebe um jeito de achar o que está guardado, e não o valor: o
 * botão de apagar tudo troca o `Saved` inteiro, e quem já tinha a porta na mão
 * continua falando com o banco de agora em vez do de antes.
 */

import { flowFor } from "../bot/flow.ts";
import type { Ctx, Session } from "../bot/session.ts";
import { newSession } from "../bot/session.ts";
import { SHOP } from "../shop/shop.ts";
import type { Moment } from "../shop/time.ts";
import type { Db, Store } from "../store.ts";
import { emptyDb, write } from "../store.ts";
import type { Bubble } from "./chat.ts";

const KEY = "paulo-santos-bot";

/**
 * A versão do que está guardado.
 *
 * O formato mudou quando a comanda entrou, e uma tela em branco explicada é
 * melhor do que um erro no meio do primeiro "oi". Subir este número descarta o
 * que estava salvo.
 */
const VERSION = 4;

/** O cliente do simulador é sempre o mesmo número. */
export const PHONE = "5511911111111";

/** E o barbeiro é o primeiro número da lista da barbearia. */
export const BARBER = SHOP.barbers[0]!;

export type Saved = {
  version: number;
  db: Db;
  sessions: Record<string, Session>;
  transcripts: Record<string, Bubble[]>;
};

export function empty(): Saved {
  return { version: VERSION, db: emptyDb(), sessions: {}, transcripts: {} };
}

export function load(): Saved {
  const raw = localStorage.getItem(KEY);
  if (!raw) return empty();
  try {
    const saved = JSON.parse(raw) as Saved;
    if (saved.version !== VERSION) return empty();
    return { ...empty(), ...saved };
  } catch {
    return empty();
  }
}

export function save(saved: Saved): void {
  localStorage.setItem(KEY, JSON.stringify(saved));
}

/**
 * O `Store` do simulador, por cima do que está em memória.
 *
 * Ele guarda no `localStorage` a cada escrita em vez de esperar o fim do turno,
 * porque o simulador manda um balão de cada vez com uma pausa no meio, e uma
 * página recarregada no meio da pausa não pode perder o agendamento.
 */
export function store(current: () => Saved): Store {
  return {
    session(phone) {
      const guardada = current().sessions[phone];
      // Uma sessão salva antes de uma mudança no fluxo pode apontar para um
      // estado que não existe mais. Recomeçar a conversa é melhor do que
      // estourar no primeiro "oi" e deixar a página sem resposta.
      const flow = flowFor(SHOP, phone);
      if (guardada && flow.states[guardada.state]) return guardada;
      return newSession(phone, flow.start);
    },
    saveSession(session) {
      const saved = current();
      saved.sessions[session.phone] = session;
      save(saved);
    },
    db: () => current().db,
    apply(effects) {
      const saved = current();
      saved.db = write(saved.db, effects);
      save(saved);
    },
  };
}

/** O mundo como o motor lê, montado a partir do que está guardado. */
export function ctxOf(saved: Saved, now: Moment): Ctx {
  return { now, shop: SHOP, agenda: saved.db.agenda, comandas: saved.db.comandas };
}
