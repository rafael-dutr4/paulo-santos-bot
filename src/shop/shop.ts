/**
 * Everything the barbershop knows about itself.
 *
 * This is data, not code. The barber changes a price or an opening hour here
 * and no state of the conversation moves, because the flow never hardcodes a
 * service, an hour or a price.
 */

import type { Day, Minutes, Weekday } from "./time.ts";

export type ServiceId = string;

export type ProductId = string;

/**
 * O que a barbearia vende sem cortar nada: pomada, shampoo, refrigerante.
 *
 * Um produto não é um serviço com duração zero. Ele não ocupa a cadeira, não
 * aparece no menu de agendamento e ninguém marca horário para comprar bala —
 * ele só entra na comanda, no fim, junto com o que foi feito.
 */
export type Product = {
  id: ProductId;
  name: string;
  /** Em centavos. */
  price: number;
};

export type Service = {
  id: ServiceId;
  /** What the client reads in the menu. */
  name: string;
  /** How long the chair is taken. */
  minutes: Minutes;
  /** In centavos, so no money is ever held in a float. */
  price: number;
};

/**
 * As formas de pagamento que existem. Quais delas a barbearia aceita, e em que
 * ordem elas aparecem na comanda, é a lista em `SHOP.payments`.
 */
export type PaymentId = "dinheiro" | "pix" | "debito" | "credito";

/** `[start, end)` in minutes since midnight. */
export type Interval = { start: Minutes; end: Minutes };

export type PeriodId = "manha" | "tarde";

/**
 * Os pedaços do dia, para a conversa não despejar todos os horários de uma vez.
 *
 * As bordas são dado da barbearia porque o fluxo corta os horários por elas. O
 * nome de cada pedaço ("manhã") é texto, e vive em `src/text/ptbr.ts`.
 */
export type Period = { id: PeriodId; from: Minutes; to: Minutes };

export type Shop = {
  name: string;
  barber: string;
  address: string;
  maps: string;
  phone: string;
  /**
   * Os números que o bot atende como barbeiro.
   *
   * É uma lista, e não um número, porque a barbearia tem uma cadeira mas pode
   * ter duas pessoas com a chave: o dono e quem fecha o caixa no sábado. Quem
   * está aqui conversa com a outra tabela de estados e vê a agenda inteira;
   * quem não está é cliente, e nenhuma pergunta do fluxo do cliente é capaz de
   * mostrar o horário de outra pessoa.
   */
  barbers: string[];
  services: Service[];
  products: Product[];
  /**
   * Opening intervals per weekday, indexed by `Weekday` (0 is domingo).
   *
   * The lunch break is not a rule anywhere in the code, it is the gap between
   * two intervals. A day with an empty list is a closed day.
   */
  hours: Record<Weekday, Interval[]>;
  periods: Period[];
  /** Candidate start times sit on this grid. */
  slotStep: Minutes;
  /** How long before an appointment it is still possible to book it. */
  minNotice: Minutes;
  /** How far ahead the agenda is open. */
  horizonDays: number;
  /** Days the shop is closed regardless of the weekday. */
  holidays: Day[];
  /** As formas de pagamento aceitas, na ordem em que a comanda as oferece. */
  payments: PaymentId[];
};

export const SHOP: Shop = {
  name: "Barbearia Paulo Santos",
  barber: "Paulo",
  address: "Rua das Palmeiras, 240, Centro",
  maps: "https://maps.google.com/?q=Rua+das+Palmeiras+240",
  phone: "5511999990000",
  barbers: ["5511999990000"],
  services: [
    { id: "corte", name: "Corte", minutes: 60, price: 4500 },
    { id: "barba", name: "Barba", minutes: 60, price: 3500 },
    { id: "corte_barba", name: "Corte + barba", minutes: 120, price: 7000 },
    { id: "pezinho", name: "Pezinho", minutes: 30, price: 2000 },
  ],
  products: [
    { id: "pomada", name: "Pomada", price: 3000 },
    { id: "shampoo", name: "Shampoo", price: 4000 },
    { id: "oleo_barba", name: "Óleo para barba", price: 5000 },
    { id: "refrigerante", name: "Refrigerante", price: 600 },
    { id: "cerveja", name: "Cerveja", price: 1000 },
    { id: "bala", name: "Bala", price: 200 },
  ],
  hours: {
    0: [], // domingo, fechado
    1: [], // segunda, fechado
    2: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 19 * 60 }],
    3: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 19 * 60 }],
    4: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 19 * 60 }],
    5: [{ start: 9 * 60, end: 12 * 60 }, { start: 14 * 60, end: 20 * 60 }],
    6: [{ start: 8 * 60, end: 17 * 60 }], // sábado, direto
  },
  periods: [
    { id: "manha", from: 0, to: 12 * 60 },
    { id: "tarde", from: 12 * 60, to: 24 * 60 },
  ],
  slotStep: 30,
  minNotice: 30,
  horizonDays: 14,
  holidays: ["2026-09-07", "2026-12-25", "2027-01-01"],
  payments: ["dinheiro", "pix", "debito", "credito"],
};

/**
 * A parte da barbearia que o barbeiro edita pela conversa.
 *
 * Preço e tempo mudam com o mercado, e produto novo chega toda semana. O resto
 * — endereço, horário de funcionamento, formas de pagamento — muda de ano em
 * ano e continua sendo dado de código.
 *
 * Por isso o catálogo mora no banco e não aqui: `SHOP` guarda com o que a
 * barbearia começa, e a casca monta o `Shop` de cada turno pondo por cima o que
 * está guardado. Nada acima disso percebe a diferença, porque o fluxo sempre
 * leu `ctx.shop.services` em vez de importar a constante.
 */
export type Catalog = { services: Service[]; products: Product[] };

export function catalogOf(shop: Shop): Catalog {
  return { services: shop.services, products: shop.products };
}

export function withCatalog(shop: Shop, catalog: Catalog): Shop {
  return { ...shop, services: catalog.services, products: catalog.products };
}

/**
 * O id de um item novo, tirado do nome.
 *
 * Sem sorteio e sem contador: "Óleo para barba" vira `oleo_para_barba`, e o
 * mesmo nome dá sempre o mesmo id. Se já existir um igual, ganha um número no
 * fim — dois produtos com o mesmo nome são raros, mas um id repetido somaria os
 * dois no relatório.
 */
export function idFrom(name: string, existing: string[]): string {
  const base =
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "item";

  if (!existing.includes(base)) return base;
  for (let n = 2; ; n++) {
    const tentativa = `${base}_${n}`;
    if (!existing.includes(tentativa)) return tentativa;
  }
}

export function serviceById(shop: Shop, id: ServiceId): Service | null {
  return shop.services.find((service) => service.id === id) ?? null;
}

export function productById(shop: Shop, id: ProductId): Product | null {
  return shop.products.find((product) => product.id === id) ?? null;
}

export function isBarber(shop: Shop, phone: string): boolean {
  return shop.barbers.includes(phone);
}
