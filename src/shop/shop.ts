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
 * aparece no menu de agendamento e ninguém marca horário para comprar bala ,
 * ele só entra na comanda, no fim, junto com o que foi feito.
 */
export type Product = {
  id: ProductId;
  name: string;
  /** Em centavos. */
  price: number;
};

/**
 * As três faixas da tabela de preços da parede.
 *
 * Elas são código, e não dado do banco, pela mesma razão que as formas de
 * pagamento: o barbeiro cria serviço toda semana e não cria uma faixa nova ,
 * "Barbearia, Tratamentos, Química" é como a barbearia se descreve, e isso muda
 * de ano em ano, não de conversa em conversa. O que ele escolhe, num serviço
 * novo, é em qual das três ele entra.
 */
export type CategoryId = "barbearia" | "tratamentos" | "quimica";

export type Category = {
  id: CategoryId;
  name: string;
  /** O ícone da faixa na parede, que a mensagem repete. */
  emoji: string;
};

export type Service = {
  id: ServiceId;
  /** What the client reads in the menu. */
  name: string;
  /** How long the chair is taken. */
  minutes: Minutes;
  /** In centavos, so no money is ever held in a float. */
  price: number;
  /** Em qual faixa da tabela ele aparece. */
  category: CategoryId;
};

/**
 * As formas de pagamento que existem. Quais delas a barbearia aceita, e em que
 * ordem elas aparecem na comanda, é a lista em `SHOP.payments`.
 */
export type PaymentId = "dinheiro" | "pix" | "debito" | "credito";

/** `[start, end)` in minutes since midnight. */
export type Interval = { start: Minutes; end: Minutes };

/**
 * Um pedaço de um dia em que a barbearia não atende, num dia em que ela abre.
 *
 * O médico às três da sexta, o casamento do primo às cinco. É a mesma ideia de
 * um dia fechado, num pedaço menor: `holidays` tira o dia inteiro da conta e um
 * bloqueio tira um intervalo dele. Os dois moram nos ajustes, e não na agenda,
 * porque nenhum dos dois é uma promessa feita a alguém, a agenda guarda o que
 * foi prometido a um cliente, e um bloqueio não tem cliente, não tem serviço,
 * não vira comanda e não entra no relatório.
 */
export type Block = { day: Day } & Interval;

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
  /** Os pedaços de dia que o barbeiro travou, um a um. */
  blocks: Block[];
  /** As formas de pagamento aceitas, na ordem em que a comanda as oferece. */
  payments: PaymentId[];
  /** As faixas da tabela, na ordem em que ela está na parede. */
  categories: Category[];
};

export const SHOP: Shop = {
  name: "Paulin Studio",
  barber: "Paulin",
  address: "Rua das Palmeiras, 240, Centro",
  maps: "https://maps.google.com/?q=Rua+das+Palmeiras+240",
  phone: "5577999999999",
  barbers: ["5577999999999"],
  /**
   * A tabela de preços da parede, na ordem em que ela está lá: barbearia,
   * tratamentos e depois química. O tempo de cada um não está na parede, ele
   * é o que a cadeira leva, e é o barbeiro quem acerta pela conversa.
   */
  categories: [
    { id: "barbearia", name: "Barbearia", emoji: "✂️" },
    { id: "tratamentos", name: "Tratamentos", emoji: "🧴" },
    { id: "quimica", name: "Química & coloração", emoji: "🧪" },
  ],
  services: [
    { id: "corte", name: "Corte", minutes: 60, price: 4000, category: "barbearia" },
    { id: "barba", name: "Barba", minutes: 45, price: 4000, category: "barbearia" },
    // O combo custa menos que os dois separados (R$ 80) e ocupa menos cadeira
    // que a soma (105 min): é o mesmo cliente, na mesma sentada.
    { id: "corte_barba", name: "Corte + barba", minutes: 90, price: 7500, category: "barbearia" },
    { id: "bigode", name: "Bigode", minutes: 15, price: 500, category: "barbearia" },
    { id: "pezinho", name: "Acabamento / pezinho", minutes: 30, price: 1500, category: "barbearia" },
    { id: "sobrancelha", name: "Sobrancelha", minutes: 15, price: 1500, category: "barbearia" },
    { id: "cavanhaque", name: "Cavanhaque", minutes: 30, price: 2000, category: "barbearia" },
    {
      id: "depilacao_nasal",
      name: "Depilação nasal",
      minutes: 15,
      price: 1500,
      category: "barbearia",
    },
    { id: "limpeza_pele", name: "Limpeza de pele", minutes: 45, price: 4500, category: "tratamentos" },
    {
      id: "hidratacao_cabelo",
      name: "Hidratação no cabelo",
      minutes: 30,
      price: 2000,
      category: "tratamentos",
    },
    {
      id: "hidratacao_barba",
      name: "Hidratação na barba",
      minutes: 30,
      price: 2000,
      category: "tratamentos",
    },
    {
      id: "pigmentacao_cabelo",
      name: "Pigmentação no cabelo",
      minutes: 30,
      price: 3500,
      category: "tratamentos",
    },
    {
      id: "pigmentacao_barba",
      name: "Pigmentação na barba",
      minutes: 30,
      price: 3500,
      category: "tratamentos",
    },
    {
      id: "progressiva",
      name: "Progressiva / selagem",
      minutes: 120,
      price: 10000,
      category: "quimica",
    },
    { id: "platinado", name: "Platinado", minutes: 180, price: 16000, category: "quimica" },
    {
      id: "luzes_platinadas",
      name: "Luzes platinadas",
      minutes: 180,
      price: 16000,
      category: "quimica",
    },
  ],
  products: [
    { id: "pomada", name: "Pomada", price: 3000 },
    { id: "shampoo", name: "Shampoo", price: 4000 },
    { id: "oleo_barba", name: "Óleo para barba", price: 5000 },
    { id: "refrigerante", name: "Refrigerante", price: 600 },
    { id: "cerveja", name: "Cerveja", price: 1000 },
    { id: "bala", name: "Bala", price: 200 },
  ],
  /**
   * "Atendimento: segunda a sábado, 8h às 20h", com o almoço no meio.
   *
   * O almoço não é regra em lugar nenhum do código: ele é o buraco entre os
   * dois intervalos do dia. Por isso dar e tirar almoço é escrever outra lista
   * de intervalos, e não ligar e desligar um campo.
   */
  hours: {
    0: [], // domingo, fechado
    1: [{ start: 8 * 60, end: 12 * 60 }, { start: 14 * 60, end: 20 * 60 }],
    2: [{ start: 8 * 60, end: 12 * 60 }, { start: 14 * 60, end: 20 * 60 }],
    3: [{ start: 8 * 60, end: 12 * 60 }, { start: 14 * 60, end: 20 * 60 }],
    4: [{ start: 8 * 60, end: 12 * 60 }, { start: 14 * 60, end: 20 * 60 }],
    5: [{ start: 8 * 60, end: 12 * 60 }, { start: 14 * 60, end: 20 * 60 }],
    6: [{ start: 8 * 60, end: 12 * 60 }, { start: 14 * 60, end: 20 * 60 }],
  },
  periods: [
    { id: "manha", from: 0, to: 12 * 60 },
    { id: "tarde", from: 12 * 60, to: 24 * 60 },
  ],
  slotStep: 30,
  minNotice: 30,
  horizonDays: 14,
  holidays: ["2026-09-07", "2026-12-25", "2027-01-01"],
  /** A barbearia abre sem nada travado: bloqueio é coisa do dia a dia. */
  blocks: [],
  payments: ["dinheiro", "pix", "debito", "credito"],
};

/**
 * A parte da barbearia que o barbeiro edita pela conversa.
 *
 * Preço e tempo mudam com o mercado, produto novo chega toda semana, e o dia
 * de folga é decidido na quinta à noite. O resto, endereço, telefone, formas
 * de pagamento, o tamanho da grade, muda de ano em ano e continua sendo dado
 * de código.
 *
 * Por isso isto mora no banco e não aqui: `SHOP` guarda com o que a barbearia
 * abre as portas, e a casca monta o `Shop` de cada turno pondo por cima o que
 * está guardado. Nada acima percebe a diferença, porque o fluxo sempre leu
 * `ctx.shop` em vez de importar a constante.
 */
export type Settings = {
  services: Service[];
  products: Product[];
  hours: Record<Weekday, Interval[]>;
  holidays: Day[];
  blocks: Block[];
};

/**
 * Os serviços partidos nas faixas da parede, na ordem da parede.
 *
 * A mesma forma de `byPeriod()` para as horas: uma faixa vazia não aparece, e
 * a numeração de quem monta a lista corre por cima dos títulos, de ponta a
 * ponta, quem lê conta a lista inteira, e não cada bloco.
 */
export function byCategory(
  shop: Shop,
  services: Service[],
): { category: Category; services: Service[] }[] {
  return shop.categories
    .map((category) => ({
      category,
      services: services.filter((service) => service.category === category.id),
    }))
    .filter((group) => group.services.length > 0);
}

export function settingsOf(shop: Shop): Settings {
  return {
    services: shop.services,
    products: shop.products,
    hours: shop.hours,
    holidays: shop.holidays,
    blocks: shop.blocks,
  };
}

export function withSettings(shop: Shop, settings: Settings): Shop {
  return { ...shop, ...settings };
}

/**
 * O horário de um dia lido como o barbeiro pensa nele: abre, fecha e almoço.
 *
 * No dado são intervalos, porque é assim que a subtração de `slots.ts` funciona
 * e porque o almoço não é uma regra em lugar nenhum, ele é o buraco entre dois
 * intervalos. Na conversa são três perguntas, que é como uma pessoa descreve o
 * próprio dia.
 */
export type Expediente = { abre: Minutes; fecha: Minutes; almoco?: Interval };

export function expedienteOf(intervals: Interval[]): Expediente | null {
  const primeiro = intervals[0];
  const ultimo = intervals.at(-1);
  if (!primeiro || !ultimo) return null;
  const almoco =
    intervals.length > 1 ? { start: primeiro.end, end: intervals[1]!.start } : undefined;
  return { abre: primeiro.start, fecha: ultimo.end, ...(almoco ? { almoco } : {}) };
}

/** O caminho de volta: de abre/fecha/almoço para os intervalos do dado. */
export function intervalsOf(expediente: Expediente): Interval[] {
  const { abre, fecha, almoco } = expediente;
  if (!almoco || almoco.start <= abre || almoco.end >= fecha || almoco.start >= almoco.end) {
    return [{ start: abre, end: fecha }];
  }
  return [
    { start: abre, end: almoco.start },
    { start: almoco.end, end: fecha },
  ];
}

/**
 * O id de um item novo, tirado do nome.
 *
 * Sem sorteio e sem contador: "Óleo para barba" vira `oleo_para_barba`, e o
 * mesmo nome dá sempre o mesmo id. Se já existir um igual, ganha um número no
 * fim, dois produtos com o mesmo nome são raros, mas um id repetido somaria os
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
