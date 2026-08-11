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

import type { Ctx, Session } from "./bot/session.ts";
import type { Agenda, Effect } from "./shop/agenda.ts";
import { apply as applyToAgenda } from "./shop/agenda.ts";
import type { Comanda } from "./shop/comanda.ts";
import type { Settings } from "./shop/shop.ts";
import { SHOP, settingsOf, withSettings } from "./shop/shop.ts";

/**
 * Tudo que a barbearia guarda: o que foi prometido, o que aconteceu e o que
 * ela vende.
 *
 * Os ajustes entraram aqui quando o barbeiro ganhou o direito de mexer neles
 * pela conversa: preço, tempo, produto, horário de funcionamento e dia
 * fechado. Dado que muda em produção mora no banco, não no código.
 */
export type Db = {
  agenda: Agenda;
  comandas: Comanda[];
  settings: Settings;
};

/** Um banco novo começa com a barbearia como ela abriu as portas. */
export const emptyDb = (settings: Settings = settingsOf(SHOP)): Db => ({
  agenda: [],
  comandas: [],
  settings,
});

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
      // Salvar cria ou atualiza, e quem já existia fica no lugar em que estava:
      // a ordem da lista é a ordem em que o cliente lê o menu, e um aumento de
      // preço não pode jogar o corte para o fim.
      case "service":
        return {
          ...current,
          settings: { ...current.settings, services: upsert(current.settings.services, effect.service) },
        };
      case "product":
        return {
          ...current,
          settings: { ...current.settings, products: upsert(current.settings.products, effect.product) },
        };
      case "hours":
        return {
          ...current,
          settings: {
            ...current.settings,
            hours: { ...current.settings.hours, [effect.weekday]: effect.intervals },
          },
        };
      // Um dia fechado é uma data numa lista, e fechar duas vezes é fechar uma.
      case "close_day":
        return {
          ...current,
          settings: {
            ...current.settings,
            holidays: [...new Set([...current.settings.holidays, effect.day])].sort(),
          },
        };
      case "open_day":
        return {
          ...current,
          settings: {
            ...current.settings,
            holidays: current.settings.holidays.filter((day) => day !== effect.day),
          },
        };
      case "remove":
        return {
          ...current,
          settings: {
            ...current.settings,
            [effect.from]: current.settings[effect.from].filter((item) => item.id !== effect.id),
          },
        };
    }
  }, db);
}

/**
 * O mundo do motor, com os efeitos de um turno aplicados.
 *
 * É `write()` visto do outro lado: o mesmo cálculo, mas devolvendo o `Ctx` que
 * o fluxo lê em vez do banco que a casca guarda. As duas tabelas de estado
 * passam esta função para o interpretador, e é ela que faz um estado poder
 * escrever e mostrar no mesmo turno.
 */
export function advance(ctx: Ctx, effects: Effect[]): Ctx {
  const db = write(
    { agenda: ctx.agenda, comandas: ctx.comandas, settings: settingsOf(ctx.shop) },
    effects,
  );
  return {
    ...ctx,
    agenda: db.agenda,
    comandas: db.comandas,
    shop: withSettings(ctx.shop, db.settings),
  };
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const onde = list.findIndex((atual) => atual.id === item.id);
  if (onde === -1) return [...list, item];
  return list.map((atual, i) => (i === onde ? item : atual));
}
