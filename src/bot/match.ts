/**
 * Reading what the client typed.
 *
 * A matcher looks at one incoming message and either claims it (returning what
 * it understood) or returns null and lets the next transition try. The
 * transitions of a state are tried in order, so the first matcher that claims
 * the message wins, and ordering is how ambiguity is resolved.
 */

import type { Minutes } from "../shop/time.ts";
import { lerHora, pareceHora } from "../text/horas.ts";
import type { Choice, Ctx, Session } from "./session.ts";

export type Input = {
  /** Exactly what the client typed, kept for anything that is copied back (a name). */
  raw: string;
  /** Lowercase, without accents, without punctuation at the edges. */
  text: string;
};

export type Match = {
  /** The number the client answered, when there was one. */
  number?: number;
  /** What that number meant, resolved against what was offered. */
  choice?: Choice;
  /** The text the client typed, for the states that capture it. */
  text?: string;
};

export type Matcher = (input: Input, session: Session, ctx: Ctx) => Match | null;

/**
 * `"Não!"`, `"nao"` and `"  NAO  "` have to be the same string before anything
 * else happens. Splitting the accent off its letter (NFD) and dropping the
 * accents is one line and covers every word in Portuguese, which a table of
 * replacements never would.
 */
export function normalize(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[!?.,;:]+$/, "");
}

export function input(raw: string): Input {
  return { raw: raw.trim(), text: normalize(raw) };
}

/**
 * The number at the start of the message.
 *
 * Clients answer `2`, `2)`, `opção 2` and `quero a 2`. Anything that starts
 * with digits counts, and a message that only mentions a number in the middle
 * ("marquei 2 semanas atrás") does not.
 *
 * O `(?![:h\d])` é o que separa uma opção de um horário. A lista de horas é
 * numerada e o cliente também pode digitar a hora, então `9` é a nona opção e
 * `09:00` é nove da manhã, e sem esse detalhe `09:00` viraria a opção 9.
 */
export function leadingNumber(text: string): number | null {
  if (pareceHora(text)) return null;
  const match = /^(?:opcao\s*|op\s*)?(\d{1,2})(?![:h\d])\b/.exec(text);
  return match ? Number(match[1]) : null;
}

/** A fixed option of a static menu. */
export function option(n: number): Matcher {
  return (input) => (leadingNumber(input.text) === n ? { number: n } : null);
}

/**
 * A number resolved against the list the bot has just presented.
 *
 * `kinds` restricts what this transition accepts, so a state that offers hours
 * and a "ver mais horários" line can route each to a different place while both
 * are numbers in the same list.
 */
export function choice(...kinds: Choice["kind"][]): Matcher {
  return (input, session) => {
    const n = leadingNumber(input.text);
    if (n === null) return null;
    const chosen = session.choices[n - 1];
    if (!chosen || !kinds.includes(chosen.kind)) return null;
    return { number: n, choice: chosen };
  };
}

/** O primeiro que reconhecer a mensagem, para uma transição aceitar duas formas. */
export function either(...matchers: Matcher[]): Matcher {
  return (input, session, ctx) => {
    for (const matcher of matchers) {
      const match = matcher(input, session, ctx);
      if (match) return match;
    }
    return null;
  };
}

/** Any of these words, as a whole word anywhere in the message. */
export function keyword(...words: string[]): Matcher {
  return (input) => {
    const found = words.some((word) =>
      new RegExp(`(^|\\s)${word}(\\s|$)`).test(input.text),
    );
    return found ? {} : null;
  };
}

export const yes: Matcher = keyword(
  "sim", "s", "isso", "confirmo", "confirmar", "pode", "claro", "ok", "beleza", "isso mesmo",
);

export const no: Matcher = keyword("nao", "n", "negativo", "cancela", "melhor nao");

/** A distância que ainda vale como "o mais perto que eu tenho". */
const PERTO = 30;

const slots = (session: Session): Minutes[] =>
  session.choices.flatMap((c) => (c.kind === "slot" ? [c.start] : []));

/**
 * Uma hora escrita em português, resolvida contra o que foi oferecido.
 *
 * `lerHora` devolve as candidatas ("duas e meia" são 14:30 e 02:30) e a escolha
 * acontece aqui, onde a lista de horários livres existe: vale a primeira
 * candidata que está livre. É o que faz "duas e meia" cair na tarde sem
 * ninguém escrever uma regra sobre barbearia dentro do leitor de horas.
 *
 * Conferir contra `choices` continua sendo a garantia do fluxo: por mais esperta
 * que fique a leitura, ninguém marca um horário que o bot não ofereceu.
 */
export const offeredHour: Matcher = (input, session) => {
  const livres = slots(session);
  for (const at of lerHora(input.text)) {
    if (livres.includes(at)) {
      return { number: at, choice: { kind: "slot", start: at } };
    }
  }
  return null;
};

/**
 * Uma hora que ninguém tem, mas que tem vizinha.
 *
 * "14:40" não existe numa grade de quinze em quinze, e mandar a lista inteira de
 * volta para o cliente achar sozinho o 14:45 é grosseria. Aqui a candidata mais
 * próxima de qualquer interpretação vence, desde que esteja a menos de meia
 * hora do que foi pedido, e o fluxo avisa que aproximou antes de confirmar.
 */
export const nearestHour: Matcher = (input, session) => {
  const livres = slots(session);
  if (livres.length === 0) return null;

  let melhor: { pedido: Minutes; perto: Minutes; distancia: number } | null = null;
  for (const pedido of lerHora(input.text)) {
    for (const perto of livres) {
      const distancia = Math.abs(perto - pedido);
      if (distancia > PERTO) continue;
      if (!melhor || distancia < melhor.distancia) melhor = { pedido, perto, distancia };
    }
  }
  if (!melhor) return null;
  return { number: melhor.pedido, choice: { kind: "slot", start: melhor.perto } };
};

/** Uma hora legível que não está livre nem perto. Responde melhor que "não entendi". */
export const anyHour: Matcher = (input) => {
  const [at] = lerHora(input.text);
  return at === undefined ? null : { number: at };
};

/** Anything the client typed, as long as it is not empty. */
export const anything: Matcher = (input) => (input.text === "" ? null : { text: input.raw });

/** A name: anything short enough to be one, and neither a number nor an hour. */
export const name: Matcher = (input) => {
  if (input.text === "" || input.raw.length > 60) return null;
  if (leadingNumber(input.text) !== null) return null;
  // Quem responde "14:15" aqui errou a pergunta, não se chama 14:15.
  if (/^[\d\s:h]+$/.test(input.text)) return null;
  return { text: input.raw };
};
