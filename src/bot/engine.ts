/**
 * The interpreter.
 *
 * This file does not know what a barbershop is. It reads a state table and
 * moves through it, and every word about hair, prices and hours lives in
 * `flow.ts` and `src/shop/`. Swapping the table would turn this into a bot for
 * a dentist without a line changing here.
 *
 * One turn:
 *
 *   1. normalize the message
 *   2. try the global rules (menu, sair), then the state's own transitions
 *   3. run the effect of the transition that claimed the message
 *   4. enter the target state, which is where messages come from
 *   5. if nothing claimed it, count the miss and repeat the question
 *
 * Messages are emitted by entering a state, never by a transition. That is why
 * the fallback path can simply re-enter the current state and get the question
 * repeated for free, and why a question is written in exactly one place.
 */

import type { Effect } from "../shop/agenda.ts";
import type { Match, Matcher } from "./match.ts";
import { input } from "./match.ts";
import type { Message } from "./message.ts";
import { msg } from "./message.ts";
import type { Ctx, Session, StateName } from "./session.ts";

/**
 * Entering a state produces what it says, and may store what it offered.
 *
 * It can also hand the turn to another state (`go`), which is how a state that
 * finds nothing to offer sends the client somewhere useful instead of asking a
 * question with no answers. A state that does this lists the targets in
 * `exits`, for the same reason a computed `go` does.
 */
export type Enter = (
  session: Session,
  ctx: Ctx,
) => { session: Session; messages: Message[]; go?: StateName };

/** What a transition does to the session, and what it asks the shell to do. */
export type Act = (
  session: Session,
  match: Match,
  ctx: Ctx,
) => { session: Session; effects?: Effect[] };

/**
 * Where a transition goes. A function decides at runtime (there are no free
 * hours, so do not ask for a day), and then it must list its possible targets
 * in `exits`, because the graph test cannot read a closure.
 */
export type Target = StateName | ((session: Session, ctx: Ctx) => StateName);

export type Transition = {
  match: Matcher;
  go: Target;
  exits?: StateName[];
  act?: Act;
};

export type State = {
  enter: Enter;
  on?: Transition[];
  /** Said its piece and walks straight on, in the same turn. */
  goto?: StateName;
  /** Where `enter` may redirect to, declared for the graph test. */
  exits?: StateName[];
  /**
   * One step back, for a client who changed their mind about the answer he
   * already gave. A state without one has nothing behind it, and "voltar" from
   * there means the menu.
   */
  back?: StateName;
  /** What it says when nothing matched. */
  fallback?: Message;
};

export type Flow = {
  states: Record<StateName, State>;
  /** Where a conversation begins. */
  start: StateName;
  /** Where a client who keeps missing is sent. */
  stuck: StateName;
  /** Consecutive misses before that happens. */
  missLimit: number;
  /** Checked before the state's own transitions, so nobody gets trapped in a branch. */
  global: Transition[];
  /**
   * O mundo depois dos efeitos deste turno.
   *
   * O `ctx` é uma foto tirada no começo do turno, e um estado que escreve e
   * mostra no mesmo turno mostraria a foto velha: o barbeiro salvava um preço
   * novo e lia a lista com o preço antigo. Aqui a tabela diz como avançar o
   * mundo, e o interpretador só chama — ele continua sem saber o que é uma
   * agenda, uma comanda ou um preço.
   *
   * Sem isto, a regra passa a ser "um estado ou escreve ou mostra", que é uma
   * regra que ninguém lembra na hora de escrever o vigésimo estado.
   */
  advance?: (ctx: Ctx, effects: Effect[]) => Ctx;
};

export type Outcome = { session: Session; messages: Message[]; effects: Effect[] };

/** A goto chain longer than this is a bug in the table, not a conversation. */
const MAX_HOPS = 10;

export function run(flow: Flow, session: Session, raw: string, ctx: Ctx): Outcome {
  const message = input(raw);
  const state = flow.states[session.state];
  if (!state) throw new Error(`estado desconhecido: ${session.state}`);

  const picked =
    pick(flow.global, message, session, ctx) ?? pick(state.on ?? [], message, session, ctx);

  if (!picked) {
    const misses = session.misses + 1;
    if (misses >= flow.missLimit) {
      return enter(flow, { ...session, misses: 0 }, flow.stuck, ctx);
    }
    // Repeat the question by re-entering the same state. The fallback comes
    // first, so the client reads "não entendi" and then the menu again.
    return enter(flow, { ...session, misses }, session.state, ctx, [
      state.fallback ?? msg("nao_entendi"),
    ]);
  }

  let moved: Session = { ...session, misses: 0 };
  const effects: Effect[] = [];
  if (picked.transition.act) {
    const acted = picked.transition.act(moved, picked.match, ctx);
    moved = acted.session;
    if (acted.effects) effects.push(...acted.effects);
  }

  const target =
    typeof picked.transition.go === "function"
      ? picked.transition.go(moved, ctx)
      : picked.transition.go;

  // O que o estado de destino lê já é o mundo com este turno dentro.
  const depois = effects.length > 0 && flow.advance ? flow.advance(ctx, effects) : ctx;
  return enter(flow, moved, target, depois, [], effects);
}

function pick(
  transitions: Transition[],
  message: ReturnType<typeof input>,
  session: Session,
  ctx: Ctx,
): { transition: Transition; match: Match } | null {
  for (const transition of transitions) {
    const match = transition.match(message, session, ctx);
    if (match) return { transition, match };
  }
  return null;
}

/** Walks into a state, following any `goto` chain, collecting what is said. */
function enter(
  flow: Flow,
  session: Session,
  target: StateName,
  ctx: Ctx,
  said: Message[] = [],
  effects: Effect[] = [],
): Outcome {
  const messages = [...said];
  let current = target;
  let moved = session;

  for (let hops = 0; hops <= MAX_HOPS; hops++) {
    const state = flow.states[current];
    if (!state) throw new Error(`estado desconhecido: ${current}`);

    const entered = state.enter({ ...moved, state: current }, ctx);
    moved = { ...entered.session, state: current };
    messages.push(...entered.messages);

    const next = entered.go ?? state.goto;
    if (!next) return { session: moved, messages, effects };
    current = next;
  }
  throw new Error(`goto em ciclo a partir de ${target}`);
}

/** A state that always says the same thing. */
export function says(...messages: Message[]): Enter {
  return (session) => ({ session, messages });
}

/** A state that says nothing and waits. */
export const silent: Enter = (session) => ({ session, messages: [] });
