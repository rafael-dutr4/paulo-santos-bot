/**
 * Everything the bot remembers about one conversation.
 *
 * The session is the whole memory of the bot. The simulator keeps one of them,
 * a WhatsApp adapter keeps a map of them by phone number, and neither has to
 * know anything else. It is a plain value, so storing it is `JSON.stringify`.
 */

import type { Agenda } from "../shop/agenda.ts";
import type { Comanda, Item } from "../shop/comanda.ts";
import type { PaymentId, ProductId, ServiceId, Shop } from "../shop/shop.ts";
import type { Day, Minutes, Moment, Weekday } from "../shop/time.ts";

export type StateName = string;

/**
 * One entry of the numbered list the bot has just presented.
 *
 * This is the part that is easy to get wrong. The client answers `3`, and `3`
 * means nothing on its own: it only means something against the list that was
 * actually shown. So the state that presents a dynamic list stores it here, and
 * the `choice()` matcher resolves the number against it.
 *
 * Because the list lives in the session, a client who answers an old message
 * after a reload cannot book an hour that was never offered to them.
 */
export type Choice =
  | { kind: "service"; id: ServiceId }
  | { kind: "product"; id: ProductId }
  | { kind: "day"; day: Day }
  | { kind: "slot"; start: Minutes }
  | { kind: "appointment"; id: string }
  /** Uma linha da comanda aberta, pela posição: os itens não têm id. */
  | { kind: "item"; index: number }
  /** A última linha da lista do catálogo: "novo serviço", "novo produto". */
  | { kind: "novo"; what: CatalogKind }
  /** A última linha de toda lista numerada. */
  | { kind: "voltar" }
  | { kind: "weekday"; weekday: Weekday }
  /** A linha que mexe em todos os dias que abrem, de uma vez. */
  | { kind: "todos" }
  /** A linha que leva à lista de datas fechadas. */
  | { kind: "fechados" }
  | { kind: "payment"; id: PaymentId };

/**
 * A comanda que o barbeiro está fechando.
 *
 * Ela mora no rascunho, e não no banco, porque enquanto o barbeiro acrescenta
 * um pezinho e corrige um valor nada disso aconteceu ainda: a comanda só
 * existe quando ele escolhe a forma de pagamento, e aí sai como um `Effect`.
 * Desistir no meio é fechar a conversa, e não apagar linha nenhuma.
 */
export type ComandaDraft = {
  /** O agendamento que está sendo fechado. */
  id: string;
  itens: Item[];
  /** A linha cujo valor está sendo corrigido. */
  item?: number;
};

export type CatalogKind = "servico" | "produto";

/**
 * O item do catálogo que o barbeiro está mexendo.
 *
 * Serve para os dois casos: um item que já existe (tem `id`) e um que está
 * sendo criado (tem só o que já foi respondido). O efeito só sai no fim, quando
 * há o suficiente para montar um serviço ou um produto inteiro.
 */
export type CatalogDraft = {
  what: CatalogKind;
  id?: string;
  name?: string;
  price?: number;
  minutes?: number;
};

/** What is being assembled during a booking. */
export type Draft = {
  serviceId?: ServiceId;
  day?: Day;
  start?: Minutes;
  /** A hora que o cliente pediu, quando o bot ofereceu a vizinha no lugar. */
  asked?: Minutes;
  /** Set while remarcando: the appointment being replaced. */
  replacing?: string;
  /** O dia que o barbeiro pediu para ver. */
  looking?: Day;
  /** Quem está esperando o dia que foi pedido: a agenda ou o relatório. */
  asking?: "agenda" | "relatorio";
  comanda?: ComandaDraft;
  catalogo?: CatalogDraft;
  /** O dia da semana cujo expediente está sendo mexido. */
  weekday?: Weekday;
  /** Ou todos os dias que abrem, de uma vez. */
  todos?: boolean;
  /**
   * O expediente sendo montado para valer em todos os dias iguais.
   *
   * Ele fica aqui, e não no banco, porque enquanto o barbeiro responde as três
   * perguntas nada aconteceu: a semana só muda na última resposta, e desistir
   * no meio não deixa metade da semana com o horário novo e metade com o
   * velho.
   */
  padrao?: { abre?: Minutes; fecha?: Minutes; almoco?: { start: Minutes; end: Minutes } };
  /** O começo do almoço, enquanto o fim ainda não foi dito. */
  almoco?: Minutes;
  /** A última hora dita, para a transição conferir o que o efeito fez. */
  hora?: Minutes;
  /** A data que o barbeiro quer fechar ou reabrir. */
  folga?: Day;
};

export type Session = {
  phone: string;
  state: StateName;
  draft: Draft;
  choices: Choice[];
  /** Consecutive answers the bot did not understand. */
  misses: number;
  /** Remembered between bookings, so a returning client is not asked twice. */
  name?: string;
};

/** The world as the engine sees it: read only, and handed in from outside. */
export type Ctx = {
  now: Moment;
  shop: Shop;
  agenda: Agenda;
  /** O que já foi fechado. O cliente nunca lê isto; o barbeiro vive disto. */
  comandas: Comanda[];
};

/**
 * Uma conversa que ainda não começou.
 *
 * O estado inicial é parâmetro porque existe mais de uma tabela: a do cliente
 * começa em `inicio` e a do barbeiro em `inicio_barbeiro`. Quem cria a sessão
 * sabe qual é a tabela daquele telefone, e o padrão serve ao caso comum.
 */
export function newSession(phone: string, start: StateName = "inicio"): Session {
  return { phone, state: start, draft: {}, choices: [], misses: 0 };
}

/** A new turn always starts from a clean draft. */
export function clearDraft(session: Session): Session {
  return { ...session, draft: {}, choices: [] };
}
