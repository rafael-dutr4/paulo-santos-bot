/**
 * Uma conversa na tela, ligada ao motor.
 *
 * Um turno é sempre a mesma coisa, e é exatamente o que um adaptador de
 * WhatsApp vai fazer:
 *
 *     mensagem -> reply(session, texto, ctx) -> guardar a sessão,
 *                 aplicar os efeitos, mandar as mensagens
 *
 * O simulador tem duas destas: a do cliente e a do barbeiro. As duas rodam este
 * arquivo, com o mesmo `Store` atrás, e o que muda entre elas é o telefone —
 * que é o que faz `reply()` escolher a tabela de estados. Um horário marcado na
 * conversa do cliente aparece na agenda do barbeiro sem nenhuma ligação entre
 * as duas telas, porque as duas leem o mesmo banco.
 */

import { reply } from "../bot/flow.ts";
import type { Ctx } from "../bot/session.ts";
import { SHOP, withCatalog } from "../shop/shop.ts";
import { hhmm } from "../shop/time.ts";
import type { Moment } from "../shop/time.ts";
import { say } from "../text/say.ts";
import type { Bubble } from "./chat.ts";
import { append, paint, scroll, typing } from "./chat.ts";
import type { Store } from "../store.ts";

/** Quanto o bot "digita" entre um balão e outro. */
const DELAY = 550;

export type Conversa = {
  /** Manda uma mensagem como este telefone e escreve a resposta na tela. */
  send: (text: string) => Promise<void>;
  /** Repinta a conversa inteira, depois de um reset ou de um reload. */
  paint: () => void;
  scroll: () => void;
  reset: () => void;
};

export type Wiring = {
  phone: string;
  /** A lista de balões. */
  chat: HTMLElement;
  form: HTMLFormElement;
  field: HTMLInputElement;
  store: Store;
  /** O relógio simulado, lido a cada turno. */
  now: () => Moment;
  transcript: () => Bubble[];
  /** Esquece a sessão deste telefone: recomeçar a conversa é recomeçar o fluxo. */
  forget: () => void;
  /** Chamado depois de cada escrita, para guardar e redesenhar o painel. */
  changed: () => void;
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export function conversa(wiring: Wiring): Conversa {
  const { phone, chat, form, field, store, now, transcript, forget, changed } = wiring;

  /**
   * O mundo de um turno.
   *
   * A barbearia não é mais a constante: é a constante com o catálogo guardado
   * por cima. Um preço que o barbeiro mudou na conversa dele aparece no menu do
   * cliente no turno seguinte, sem ninguém avisar ninguém — as duas conversas
   * leem o mesmo banco.
   */
  function ctx(at: Moment): Ctx {
    const db = store.db();
    return {
      now: at,
      shop: withCatalog(SHOP, db.catalog),
      agenda: db.agenda,
      comandas: db.comandas,
    };
  }

  async function send(text: string): Promise<void> {
    const at = now();

    const mine: Bubble = { from: "cliente", text, at: hhmm(at.at) };
    transcript().push(mine);
    append(chat, mine);

    const outcome = reply(store.session(phone), text, ctx(at));
    store.saveSession(outcome.session);
    store.apply(outcome.effects);
    changed();

    // Um balão de cada vez, com uma pausa no meio. Uma resposta de três
    // mensagens chega como três mensagens, que é como o WhatsApp se comporta.
    for (const message of outcome.messages) {
      const stop = typing(chat);
      await sleep(DELAY);
      stop();
      const bubble: Bubble = { from: "bot", text: say(message), at: hhmm(at.at) };
      transcript().push(bubble);
      append(chat, bubble);
      changed();
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = field.value.trim();
    if (text === "") return;
    field.value = "";
    field.dispatchEvent(new Event("input"));
    void send(text);
  });

  return {
    send,
    paint: () => paint(chat, transcript()),
    scroll: () => scroll(chat),
    reset: () => {
      transcript().length = 0;
      forget();
      paint(chat, transcript());
      changed();
    },
  };
}
