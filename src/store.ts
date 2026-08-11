/**
 * O banco, como porta.
 *
 * O motor é puro: ele recebe o mundo em `Ctx` e devolve `Effect[]`. Alguém tem
 * que segurar esse mundo entre um turno e o outro, e esse alguém é o `Store`.
 * Este arquivo diz o que ele precisa saber fazer, e nada sobre como.
 *
 * Hoje existe uma implementação, o `localStorage` do simulador. Amanhã existe
 * outra, um Postgres atrás de um adaptador de WhatsApp, e o que muda é este
 * arquivo ganhar um segundo vizinho — não o fluxo, não o motor, não o
 * relatório. É por isso que a porta é estreita de propósito: quatro operações,
 * e uma delas é pura.
 *
 * A parte pura é `write()`. Aplicar efeitos é uma função de `(Db, Effect[])`
 * para `Db`, então ela é testável sem banco nenhum, e qualquer implementação de
 * `Store` a reaproveita em vez de reescrever a regra de o que cada efeito faz.
 */

import type { Session } from "./bot/session.ts";
import type { Agenda, Effect } from "./shop/agenda.ts";
import { apply as applyToAgenda } from "./shop/agenda.ts";
import type { Comanda } from "./shop/comanda.ts";

/** Tudo que a barbearia guarda: o que foi prometido e o que aconteceu. */
export type Db = {
  agenda: Agenda;
  comandas: Comanda[];
};

export const emptyDb = (): Db => ({ agenda: [], comandas: [] });

export type Store = {
  /** A sessão daquele telefone, ou uma nova se ele nunca falou aqui. */
  session(phone: string): Session;
  saveSession(session: Session): void;
  /** O mundo como o motor vai ler: agenda e comandas. */
  db(): Db;
  apply(effects: Effect[]): void;
};

/**
 * O que cada efeito escreve.
 *
 * Fechar duas vezes o mesmo horário substitui a comanda em vez de somar duas,
 * pela mesma razão que `book` substitui pelo id: o efeito descreve o estado
 * final daquele horário, e reaplicar a mesma conversa não pode dobrar o caixa.
 */
export function write(db: Db, effects: Effect[]): Db {
  return effects.reduce<Db>((current, effect) => {
    switch (effect.kind) {
      case "book":
      case "cancel":
        return { ...current, agenda: applyToAgenda(current.agenda, effect) };
      case "close":
        return {
          ...current,
          comandas: [
            ...current.comandas.filter((c) => c.id !== effect.comanda.id),
            effect.comanda,
          ],
        };
    }
  }, db);
}
