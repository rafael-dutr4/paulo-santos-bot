/**
 * O outro lado do balcão, também como tabela.
 *
 * O barbeiro fala com o mesmo número do bot, pelo mesmo WhatsApp, e o que
 * separa a conversa dele da de um cliente é uma linha: o telefone está em
 * `SHOP.barbers`. Aí `reply()` roda esta tabela em vez da outra, no mesmo
 * interpretador, sem uma única condição dentro de `engine.ts`.
 *
 * Isto é o que valeu a pena ter feito o fluxo virar dado: um produto novo (a
 * agenda do barbeiro, a comanda, o relatório) é um arquivo de tabela ao lado do
 * primeiro, e não um `if` no meio do motor.
 *
 * O barbeiro faz três coisas aqui:
 *
 *   - **ver a agenda**, de hoje ou de um dia qualquer;
 *   - **fechar a comanda** de um atendimento que já passou, dizendo se o
 *     cliente veio, o que saiu e como pagou;
 *   - **pedir o relatório** de um dia, da semana ou do mês.
 *
 * Ver e pedir não escrevem nada. A única escrita desta tabela inteira é o
 * `close` no fim da comanda, e ela sai como efeito, igual a um agendamento.
 */

import type { Appointment, Effect } from "../shop/agenda.ts";
import { byId } from "../shop/agenda.ts";
import type { Comanda } from "../shop/comanda.ts";
import { comandaById, itemFor, itemForProduct, itemsFor, pending, totalOf } from "../shop/comanda.ts";
import type { Range } from "../shop/report.ts";
import { dayRange, monthRange, report, weekRange } from "../shop/report.ts";
import type { CategoryId, Expediente, Interval } from "../shop/shop.ts";
import { overlaps, upcomingBlocks } from "../shop/slots.ts";
import {
  expedienteOf,
  idFrom,
  intervalsOf,
  productById,
  serviceById,
} from "../shop/shop.ts";
import type { Day, Minutes, Weekday } from "../shop/time.ts";
import { compare, weekday as weekdayFor } from "../shop/time.ts";
import type { Enter, Flow, State } from "./engine.ts";
import { numbered, says, silent } from "./engine.ts";
import {
  anyHour,
  anything,
  choice,
  duration,
  either,
  keyword,
  money,
  name as aName,
  no,
  option,
  someDay,
  when,
  yes,
} from "./match.ts";
import { advance } from "../store.ts";
import type { Message } from "./message.ts";
import { msg } from "./message.ts";
import type { CatalogDraft, Choice, ComandaDraft, Ctx, Session, StateName } from "./session.ts";
import { clearDraft } from "./session.ts";

/** Para onde "voltar" leva do lado do barbeiro. */
const BACK_TARGETS = [
  "menu_barbeiro",
  "comanda",
  "catalogo",
  "dias_horarios",
  "editar_dia_semana",
  "bloqueios",
];

function backFrom(session: Session): StateName {
  return BARBEIRO.states[session.state]?.back ?? "menu_barbeiro";
}

/**
 * Onde fica o "voltar" em cada menu de tamanho fixo.
 *
 * As listas dinâmicas ganham a última linha de `numbered()`, que sabe quantos
 * itens saíram. Um menu escrito à mão não tem quem conte por ele, então o
 * número é uma constante usada nos dois lugares, no texto e na transição.
 */
const VOLTAR_COMANDA = 5;
const VOLTAR_SERVICO = 5;
const VOLTAR_PRODUTO = 3;
const VOLTAR_RELATORIO = 5;
const VOLTAR_DIA_ABERTO = 5;
const VOLTAR_DIA_FECHADO = 2;
const VOLTAR_TODOS = 5;

// --- lendo o rascunho ------------------------------------------------------

/** O dia que o barbeiro está olhando. Sem pedido nenhum, é hoje. */
function looking(session: Session, ctx: Ctx): Day {
  return session.draft.looking ?? ctx.now.day;
}

function comandaDraft(session: Session): ComandaDraft | null {
  return session.draft.comanda ?? null;
}

/** O agendamento que a comanda aberta está fechando. */
function target(session: Session, ctx: Ctx): Appointment | null {
  const draft = comandaDraft(session);
  return draft ? byId(ctx.agenda, draft.id) : null;
}

function withComanda(session: Session, comanda: ComandaDraft): Session {
  return { ...session, draft: { ...session.draft, comanda } };
}

function serviceName(ctx: Ctx, id: string): string {
  return serviceById(ctx.shop, id)?.name ?? id;
}

// --- a agenda --------------------------------------------------------------

/**
 * O dia do barbeiro, um horário por linha.
 *
 * Cada linha diz em que pé está: fechada, faltou, ou ainda por fechar. O
 * estado não é guardado em lugar nenhum, ele é a resposta de olhar se existe
 * uma comanda com aquele id, que é a mesma subtração que monta a lista de
 * pendências.
 */
const agenda: State = {
  enter: (session, ctx) => {
    const day = looking(session, ctx);
    const doDia = ctx.agenda.filter((a) => a.day === day);
    if (doDia.length === 0) {
      return { session, messages: [msg("agenda_vazia", { dia: day })] };
    }

    return {
      session,
      messages: [
        msg("agenda_do_dia", {
          dia: day,
          itens: doDia.map((a) => {
            const comanda = comandaById(ctx.comandas, a.id);
            return msg("item_agenda", {
              hora: a.start,
              servico: serviceName(ctx, a.serviceId),
              nome: a.clientName,
              // Três estados possíveis numa palavra só, decididos aqui porque é
              // aqui que a agenda e as comandas estão juntas.
              situacao: comanda ? (comanda.status === "feito" ? "feito" : "faltou") : "aberto",
              total: comanda?.total ?? 0,
            });
          }),
        }),
      ],
    };
  },
  goto: "menu_barbeiro",
};

const pedirDia: State = {
  enter: says(msg("pedir_dia")),
  on: [
    {
      match: someDay,
      act: (session, match) => ({
        session:
          match.choice?.kind === "day"
            ? { ...session, draft: { ...session.draft, looking: match.choice.day } }
            : session,
      }),
      // O mesmo pedido de dia serve à agenda e ao relatório, e o rascunho
      // guarda quem perguntou.
      go: (session) => (session.draft.asking === "relatorio" ? "relatorio_dia" : "agenda"),
      exits: ["agenda", "relatorio_dia"],
    },
  ],
};

// --- a comanda -------------------------------------------------------------

const comandas: State = {
  enter: (session, ctx) => {
    const abertas = pending(ctx.agenda, ctx.comandas, ctx.now);
    if (abertas.length === 0) return { session, messages: [], go: "nada_a_fechar" };

    const lista = numbered(
      abertas.map((a, i) =>
        msg("item_pendente", {
          n: i + 1,
          dia: a.day,
          hora: a.start,
          servico: serviceName(ctx, a.serviceId),
          nome: a.clientName,
        }),
      ),
      abertas.map((a) => ({ kind: "appointment", id: a.id }) as const),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("comandas_pendentes", { itens: lista.itens })],
    };
  },
  exits: ["nada_a_fechar"],
  on: [
    {
      match: choice("appointment"),
      act: (session, match, ctx) => {
        if (match.choice?.kind !== "appointment") return { session };
        const appointment = byId(ctx.agenda, match.choice.id);
        if (!appointment) return { session };
        // A comanda já nasce com o que foi agendado, pelo preço de tabela.
        // Fechar sem mudar nada é o caso de sempre, e é o que custa menos toques.
        return {
          session: withComanda(session, {
            id: appointment.id,
            itens: itemsFor(ctx.shop, appointment),
          }),
        };
      },
      go: "compareceu",
    },
  ],
};

const compareceu: State = {
  enter: (session, ctx) => {
    const appointment = target(session, ctx);
    if (!appointment) return { session, messages: [], go: "menu_barbeiro" };
    return {
      session,
      messages: [
        msg("compareceu", {
          nome: appointment.clientName,
          dia: appointment.day,
          hora: appointment.start,
          servico: serviceName(ctx, appointment.serviceId),
        }),
      ],
    };
  },
  exits: ["menu_barbeiro"],
  on: [
    { match: yes, go: "comanda" },
    {
      // A falta também é um fechamento: sem ela, o horário fica pendente para
      // sempre e o relatório não sabe contar quantos não vieram.
      match: no,
      act: (session, _match, ctx) => {
        const appointment = target(session, ctx);
        if (!appointment) return { session };
        const comanda: Comanda = {
          ...registro(appointment, ctx),
          status: "faltou",
          itens: [],
          total: 0,
        };
        return { session, effects: [{ kind: "close", comanda }] };
      },
      go: "comanda_faltou",
    },
  ],
};

/** O que toda comanda copia do agendamento, tenha o cliente vindo ou não. */
function registro(appointment: Appointment, ctx: Ctx): Omit<Comanda, "status" | "itens" | "total"> {
  return {
    id: appointment.id,
    day: appointment.day,
    start: appointment.start,
    phone: appointment.phone,
    clientName: appointment.clientName,
    closedAt: ctx.now,
  };
}

const comanda: State = {
  enter: (session, ctx) => {
    const draft = comandaDraft(session);
    const appointment = target(session, ctx);
    if (!draft || !appointment) return { session, messages: [], go: "menu_barbeiro" };

    return {
      session,
      messages: [
        msg("comanda", {
          nome: appointment.clientName,
          dia: appointment.day,
          hora: appointment.start,
          itens: draft.itens.map((item) =>
            msg("item_comanda", { nome: item.name, valor: item.price }),
          ),
          total: totalOf(draft.itens),
          voltar: VOLTAR_COMANDA,
        }),
      ],
    };
  },
  exits: ["menu_barbeiro"],
  on: [
    { match: option(1), go: "servico_extra" },
    { match: option(2), go: "produto_extra" },
    {
      match: option(3),
      // Com uma linha só não há o que escolher, e perguntar qual seria uma
      // pergunta com uma resposta possível.
      act: (session) => {
        const draft = comandaDraft(session);
        return draft && draft.itens.length === 1
          ? { session: withComanda(session, { ...draft, item: 0 }) }
          : { session };
      },
      go: (session) => ((comandaDraft(session)?.itens.length ?? 0) <= 1 ? "pedir_valor" : "escolher_item"),
      exits: ["pedir_valor", "escolher_item"],
    },
    { match: option(4), go: "escolher_pagamento" },
    { match: option(VOLTAR_COMANDA), go: backFrom, exits: BACK_TARGETS },
  ],
};

/**
 * O que o cliente levou além do que foi feito.
 *
 * Mesmo desenho do serviço extra, outra lista. O produto não tem duração e não
 * mexe na agenda: ele nasce e morre dentro da comanda.
 */
const produtoExtra: State = {
  enter: (session, ctx) => {
    const lista = numbered(
      ctx.shop.products.map((product, i) =>
        msg("item_produto", { n: i + 1, nome: product.name, preco: product.price }),
      ),
      ctx.shop.products.map((product) => ({ kind: "product", id: product.id }) as const),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("produto_extra", { itens: lista.itens })],
    };
  },
  back: "comanda",
  on: [
    {
      match: choice("product"),
      act: (session, match, ctx) => {
        const draft = comandaDraft(session);
        if (!draft || match.choice?.kind !== "product") return { session };
        const product = productById(ctx.shop, match.choice.id);
        if (!product) return { session };
        return {
          session: withComanda(session, { ...draft, itens: [...draft.itens, itemForProduct(product)] }),
        };
      },
      go: "comanda",
    },
  ],
};

const servicoExtra: State = {
  enter: (session, ctx) => {
    const lista = numbered(
      ctx.shop.services.map((service, i) =>
        msg("item_servico", {
          n: i + 1,
          nome: service.name,
          minutos: service.minutes,
          preco: service.price,
        }),
      ),
      ctx.shop.services.map((service) => ({ kind: "service", id: service.id }) as const),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("servico_extra", { itens: lista.itens })],
    };
  },
  back: "comanda",
  on: [
    {
      match: choice("service"),
      act: (session, match, ctx) => {
        const draft = comandaDraft(session);
        if (!draft || match.choice?.kind !== "service") return { session };
        const service = serviceById(ctx.shop, match.choice.id);
        if (!service) return { session };
        return { session: withComanda(session, { ...draft, itens: [...draft.itens, itemFor(service)] }) };
      },
      go: "comanda",
    },
  ],
};

const escolherItem: State = {
  enter: (session, ctx) => {
    const draft = comandaDraft(session);
    if (!draft) return { session, messages: [], go: "menu_barbeiro" };
    const lista = numbered(
      draft.itens.map((item, i) =>
        msg("item_para_corrigir", { n: i + 1, nome: item.name, valor: item.price }),
      ),
      draft.itens.map((_item, index) => ({ kind: "item", index }) as const),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("escolher_item", { itens: lista.itens })],
    };
  },
  exits: ["menu_barbeiro"],
  back: "comanda",
  on: [
    {
      match: choice("item"),
      act: (session, match) => {
        const draft = comandaDraft(session);
        if (!draft || match.choice?.kind !== "item") return { session };
        return { session: withComanda(session, { ...draft, item: match.choice.index }) };
      },
      go: "pedir_valor",
    },
  ],
};

const pedirValor: State = {
  enter: (session, ctx) => {
    const draft = comandaDraft(session);
    const item = draft?.item === undefined ? undefined : draft.itens[draft.item];
    if (!item) return { session, messages: [], go: "comanda" };
    return {
      session,
      messages: [
        msg("pedir_valor", { nome: item.name, valor: item.price }),
      ],
    };
  },
  exits: ["comanda"],
  back: "comanda",
  on: [
    {
      match: money,
      act: (session, match) => ({ session: repriced(session, match.number ?? 0) }),
      go: "comanda",
    },
    {
      // Acrescentou o que não devia, ou o cliente desistiu do pezinho.
      match: keyword("tirar", "remover", "apagar", "excluir"),
      act: (session) => ({ session: withoutItem(session) }),
      go: "comanda",
    },
  ],
};

function repriced(session: Session, price: number): Session {
  const draft = comandaDraft(session);
  if (!draft || draft.item === undefined) return session;
  const itens = draft.itens.map((item, i) => (i === draft.item ? { ...item, price } : item));
  return withComanda(session, { id: draft.id, itens });
}

function withoutItem(session: Session): Session {
  const draft = comandaDraft(session);
  if (!draft || draft.item === undefined) return session;
  return withComanda(session, {
    id: draft.id,
    itens: draft.itens.filter((_item, i) => i !== draft.item),
  });
}

const escolherPagamento: State = {
  enter: (session, ctx) => {
    const lista = numbered(
      ctx.shop.payments.map((id, i) => msg("item_pagamento", { n: i + 1, forma: id })),
      ctx.shop.payments.map((id) => ({ kind: "payment", id }) as const),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [
        msg("escolher_pagamento", {
          total: totalOf(comandaDraft(session)?.itens ?? []),
          itens: lista.itens,
        }),
      ],
    };
  },
  back: "comanda",
  on: [
    {
      // A forma de pagamento é a última pergunta de propósito: é ela que fecha
      // a comanda, então até aqui nada foi escrito e desistir não custa nada.
      match: choice("payment"),
      act: (session, match, ctx) => {
        const draft = comandaDraft(session);
        const appointment = target(session, ctx);
        if (!draft || !appointment || match.choice?.kind !== "payment") return { session };
        const comanda: Comanda = {
          ...registro(appointment, ctx),
          status: "feito",
          itens: draft.itens,
          total: totalOf(draft.itens),
          payment: match.choice.id,
        };
        const effects: Effect[] = [{ kind: "close", comanda }];
        return { session, effects };
      },
      go: "comanda_fechada",
    },
  ],
};

const comandaFechada: State = {
  enter: (session, ctx) => {
    const draft = comandaDraft(session);
    const appointment = target(session, ctx);
    if (!draft || !appointment) return { session, messages: [], go: "comandas" };
    return {
      session,
      messages: [
        msg("comanda_fechada", {
          nome: appointment.clientName,
          total: totalOf(draft.itens),
          itens: draft.itens.length,
        }),
      ],
    };
  },
  // Fechar uma comanda devolve para a fila, e não para o menu: o barbeiro fecha
  // o dia em sequência, e duas mensagens de navegação entre uma comanda e a
  // seguinte são metade do custo da tarefa. Se a fila esvaziou, `comandas` já
  // cai em `nada_a_fechar` sozinho.
  goto: "comandas",
};

const comandaFaltou: State = {
  enter: (session, ctx) => {
    const appointment = target(session, ctx);
    return {
      session,
      messages: [msg("comanda_faltou", { nome: appointment?.clientName ?? "" })],
    };
  },
  // Fechar uma comanda devolve para a fila, e não para o menu: o barbeiro
  // fecha o dia em sequência, e duas mensagens de navegação entre uma e a
  // seguinte são metade do custo da tarefa. Se a fila esvaziou, `comandas` já
  // cai em `nada_a_fechar` sozinho.
  goto: "comandas",
};

// --- o catálogo -----------------------------------------------------------

/**
 * O que a barbearia vende, e o único lugar do projeto onde o preço muda.
 *
 * A lista é uma só, com serviços e produtos, e as duas últimas linhas são
 * "novo": é a mesma numeração de sempre, e por isso o barbeiro não precisa
 * decorar um segundo jeito de responder. Quem separa uma coisa da outra é o
 * tipo da oferta guardada na sessão, não o número que ele digitou.
 */
const catalogo: State = {
  enter: (session, ctx) => {
    const servicos = ctx.shop.services;
    const produtos = ctx.shop.products;
    const choices: Choice[] = [
      ...servicos.map((s) => ({ kind: "service", id: s.id }) as const),
      ...produtos.map((p) => ({ kind: "product", id: p.id }) as const),
      { kind: "novo", what: "servico" },
      { kind: "novo", what: "produto" },
      { kind: "voltar" },
    ];

    let n = 0;
    return {
      session: { ...session, choices, draft: {} },
      messages: [
        msg("catalogo", {
          servicos: servicos.map((service) =>
            msg("linha_catalogo_servico", {
              n: ++n,
              nome: service.name,
              minutos: service.minutes,
              preco: service.price,
            }),
          ),
          produtos: produtos.map((product) =>
            msg("linha_catalogo_produto", { n: ++n, nome: product.name, preco: product.price }),
          ),
          novo_servico: ++n,
          novo_produto: ++n,
          voltar: ++n,
        }),
      ],
    };
  },
  on: [
    {
      match: choice("service", "product"),
      act: (session, match) => {
        if (match.choice?.kind !== "service" && match.choice?.kind !== "product") return { session };
        return {
          session: {
            ...session,
            draft: {
              catalogo: {
                what: match.choice.kind === "service" ? "servico" : "produto",
                id: match.choice.id,
              },
            },
          },
        };
      },
      go: "editar_item",
    },
    {
      match: choice("novo"),
      act: (session, match) => ({
        session:
          match.choice?.kind === "novo"
            ? { ...session, draft: { catalogo: { what: match.choice.what } } }
            : session,
      }),
      go: "novo_nome",
    },
  ],
};

function catalogDraft(session: Session): CatalogDraft | null {
  return session.draft.catalogo ?? null;
}

/**
 * Marca quem fez a pergunta, para o erro voltar nela e não no topo do ramo.
 *
 * O nome do estado é escrito aqui à mão porque um estado é um valor e não sabe
 * como se chama. `tests/flow.test.ts` confere que todo nome citado existe, e o
 * `exits` de `horario_invalido` lista todos eles.
 */
function perguntou(session: Session, state: StateName): Session {
  return { ...session, draft: { ...session.draft, pergunta: state } };
}

const isServico = (session: Session): boolean => catalogDraft(session)?.what === "servico";
const isProduto = (session: Session): boolean => catalogDraft(session)?.what === "produto";

/** O item que está sendo editado, do jeito que ele está agora no catálogo. */
function editando(
  session: Session,
  ctx: Ctx,
): { name: string; price: number; minutes?: Minutes; category?: CategoryId } | null {
  const draft = catalogDraft(session);
  if (!draft?.id) return null;
  if (draft.what === "servico") {
    const service = serviceById(ctx.shop, draft.id);
    return service
      ? {
          name: service.name,
          price: service.price,
          minutes: service.minutes,
          category: service.category,
        }
      : null;
  }
  const product = productById(ctx.shop, draft.id);
  return product ? { name: product.name, price: product.price } : null;
}

const editarItem: State = {
  enter: (session, ctx) => {
    const item = editando(session, ctx);
    if (!item) return { session, messages: [], go: "catalogo" };
    return {
      session,
      messages: [
        msg(isServico(session) ? "editar_servico" : "editar_produto", {
          nome: item.name,
          preco: item.price,
          minutos: item.minutes ?? 0,
          faixa: nomeDaFaixa(ctx, item.category),
          voltar: isServico(session) ? VOLTAR_SERVICO : VOLTAR_PRODUTO,
        }),
      ],
    };
  },
  exits: ["catalogo"],
  back: "catalogo",
  on: [
    { match: option(1), go: "mudar_preco" },
    { match: when(isServico, option(2)), go: "mudar_tempo" },
    { match: when(isServico, option(3)), go: "escolher_categoria" },
    { match: when(isServico, option(4)), go: "confirmar_tirar" },
    { match: when(isProduto, option(2)), go: "confirmar_tirar" },
    { match: when(isServico, option(VOLTAR_SERVICO)), go: backFrom, exits: BACK_TARGETS },
    { match: when(isProduto, option(VOLTAR_PRODUTO)), go: backFrom, exits: BACK_TARGETS },
  ],
};

/**
 * Salvar é sempre o mesmo efeito, com o que o rascunho tiver de novo por cima.
 *
 * Editar e criar acabam aqui do mesmo jeito: o que muda é se o item já existia,
 * e isso o `write()` resolve pelo id.
 */
function salvar(session: Session, ctx: Ctx, mudanca: Partial<CatalogDraft>): Effect[] {
  const draft = catalogDraft(session);
  if (!draft) return [];
  const atual = editando(session, ctx);
  const name = mudanca.name ?? draft.name ?? atual?.name ?? "";
  const price = mudanca.price ?? draft.price ?? atual?.price ?? 0;
  if (name === "") return [];

  if (draft.what === "produto") {
    const id = draft.id ?? idFrom(name, ctx.shop.products.map((p) => p.id));
    return [{ kind: "product", product: { id, name, price } }];
  }

  const minutes = mudanca.minutes ?? draft.minutes ?? atual?.minutes ?? 0;
  if (minutes <= 0) return [];
  // Um serviço sem faixa não existe: a tabela tem três, e quem cria escolhe uma.
  // O padrão só cobre o serviço antigo de um banco gravado antes das faixas.
  const category = mudanca.category ?? draft.category ?? atual?.category ?? "barbearia";
  const id = draft.id ?? idFrom(name, ctx.shop.services.map((s) => s.id));
  return [{ kind: "service", service: { id, name, minutes, price, category } }];
}

const mudarPreco: State = {
  enter: (session, ctx) => {
    const item = editando(session, ctx);
    return {
      session,
      messages: [msg("mudar_preco", { nome: item?.name ?? "", preco: item?.price ?? 0 })],
    };
  },
  back: "catalogo",
  on: [
    {
      match: money,
      act: (session, match, ctx) => ({
        session,
        effects: salvar(session, ctx, { price: match.number ?? 0 }),
      }),
      go: "salvo",
    },
  ],
};

const mudarTempo: State = {
  enter: (session, ctx) => {
    const item = editando(session, ctx);
    return {
      session,
      messages: [msg("mudar_tempo", { nome: item?.name ?? "", minutos: item?.minutes ?? 0 })],
    };
  },
  back: "catalogo",
  on: [
    {
      match: duration,
      act: (session, match, ctx) => ({
        session,
        effects: salvar(session, ctx, { minutes: match.number ?? 0 }),
      }),
      go: "salvo",
    },
  ],
};

const confirmarTirar: State = {
  enter: (session, ctx) => {
    const item = editando(session, ctx);
    if (!item) return { session, messages: [], go: "catalogo" };
    return { session, messages: [msg("confirmar_tirar", { nome: item.name })] };
  },
  exits: ["catalogo"],
  back: "catalogo",
  on: [
    {
      match: yes,
      act: (session) => {
        const draft = catalogDraft(session);
        if (!draft?.id) return { session };
        return {
          session,
          effects: [
            {
              kind: "remove",
              from: draft.what === "servico" ? "services" : "products",
              id: draft.id,
            },
          ],
        };
      },
      go: "tirado",
    },
    { match: no, go: "catalogo" },
  ],
};

// --- um item novo ----------------------------------------------------------

const novoNome: State = {
  enter: (session) => ({
    session,
    messages: [msg(isServico(session) ? "novo_servico" : "novo_produto")],
  }),
  back: "catalogo",
  on: [
    {
      match: aName,
      act: (session, match) => {
        const draft = catalogDraft(session);
        if (!draft || !match.text) return { session };
        return { session: { ...session, draft: { catalogo: { ...draft, name: match.text } } } };
      },
      go: "novo_preco",
    },
  ],
};

const novoPreco: State = {
  enter: (session) => ({
    session,
    messages: [msg("novo_preco", { nome: catalogDraft(session)?.name ?? "" })],
  }),
  back: "catalogo",
  on: [
    {
      // Produto acaba aqui: ele não tem duração. Serviço ainda precisa dizer
      // quanto tempo ocupa a cadeira, senão a agenda não sabe encaixá-lo.
      match: money,
      act: (session, match, ctx) => {
        const draft = catalogDraft(session);
        if (!draft) return { session };
        const price = match.number ?? 0;
        const guardado: Session = {
          ...session,
          draft: { catalogo: { ...draft, price } },
        };
        return draft.what === "produto"
          ? { session: guardado, effects: salvar(session, ctx, { price }) }
          : { session: guardado };
      },
      go: (session) => (isProduto(session) ? "salvo" : "novo_tempo"),
      exits: ["salvo", "novo_tempo"],
    },
  ],
};

const novoTempo: State = {
  enter: (session) => ({
    session,
    messages: [msg("novo_tempo", { nome: catalogDraft(session)?.name ?? "" })],
  }),
  back: "catalogo",
  on: [
    {
      // O tempo fica no rascunho: só depois da faixa é que o serviço é gravado,
      // pela mesma razão que a comanda espera a forma de pagamento.
      match: duration,
      act: (session, match) => {
        const draft = catalogDraft(session);
        if (!draft) return { session };
        return {
          session: { ...session, draft: { catalogo: { ...draft, minutes: match.number ?? 0 } } },
        };
      },
      go: "escolher_categoria",
    },
  ],
};

/** O nome da faixa, para as mensagens que a mostram. */
function nomeDaFaixa(ctx: Ctx, id: CategoryId | undefined): string {
  return ctx.shop.categories.find((c) => c.id === id)?.name ?? "";
}

/**
 * A faixa da tabela, no caminho de criar e no de corrigir.
 *
 * Um estado só para os dois porque a pergunta é a mesma e o que ela faz é o
 * mesmo, salvar. Quem chega de `novo_tempo` está criando e quem chega de
 * `editar_item` está corrigindo, e `salvar()` já resolve isso pelo id do
 * rascunho, como no preço e no tempo.
 */
const escolherCategoria: State = {
  enter: (session, ctx) => {
    const lista = numbered(
      ctx.shop.categories.map((category, i) =>
        msg("item_categoria", { n: i + 1, nome: category.name, emoji: category.emoji }),
      ),
      ctx.shop.categories.map((category): Choice => ({ kind: "categoria", id: category.id })),
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [
        msg("escolher_categoria", {
          nome: catalogDraft(session)?.name ?? editando(session, ctx)?.name ?? "",
          itens: lista.itens,
        }),
      ],
    };
  },
  back: "catalogo",
  on: [
    {
      match: choice("categoria"),
      act: (session, match, ctx) => ({
        session,
        effects:
          match.choice?.kind === "categoria"
            ? salvar(session, ctx, { category: match.choice.id })
            : [],
      }),
      go: "salvo",
    },
  ],
};

// --- os dias e o expediente ------------------------------------------------

/** A semana como a barbearia pensa nela: começa na segunda. */
const SEMANA: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const diasHorarios: State = {
  enter: (session, ctx) => {
    const choices: Choice[] = [
      ...SEMANA.map((weekday) => ({ kind: "weekday", weekday }) as const),
      { kind: "todos" },
      { kind: "fechados" },
    ];
    const itens: Message[] = SEMANA.map((weekday, i) =>
      msg("linha_dia_semana", {
        n: i + 1,
        dia: weekday,
        aberto: ctx.shop.hours[weekday].length > 0 ? 1 : 0,
        horario: intervalosEscritos(ctx.shop.hours[weekday]),
      }),
    );
    const lista = numbered(
      [
        ...itens,
        msg("item_todos_dias", { n: SEMANA.length + 1 }),
        msg("item_fechados", { n: SEMANA.length + 2, quantos: proximasFolgas(ctx).length }),
      ],
      choices,
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("dias_horarios", { itens: lista.itens })],
    };
  },
  on: [
    {
      match: choice("weekday"),
      act: (session, match) => ({
        session:
          match.choice?.kind === "weekday"
            ? { ...session, draft: { weekday: match.choice.weekday } }
            : session,
      }),
      go: "editar_dia_semana",
    },
    {
      match: choice("todos"),
      act: (session) => ({ session: { ...session, draft: { todos: true } } }),
      go: "editar_todos",
    },
    { match: choice("fechados"), go: "dias_fechados" },
  ],
};

/**
 * O mesmo editor, apontado para a semana inteira.
 *
 * Cada pergunta mexe num campo só e deixa o resto de cada dia como estava:
 * mudar a abertura para todos não iguala os fechamentos, porque o sábado fecha
 * mais cedo e isso quase nunca é o que se quis dizer.
 *
 * Dia fechado continua fechado. Abrir a semana toda por engano seria o tipo de
 * estrago que o bot não pode fazer com uma tecla.
 */
/**
 * Fechar um dia da semana pede confirmação, como as outras três destrutivas.
 *
 * Tirar um serviço confirma, reabrir uma data confirma, cancelar um horário
 * confirma. Esta era a única que não: quatro respostas seguidas e a segunda
 * deixava de existir para sempre.
 */
const confirmarFecharSemana: State = {
  enter: (session) => ({
    session,
    messages: [msg("confirmar_fechar_semana", { dia: weekdayOf(session) ?? 0 })],
  }),
  back: "editar_dia_semana",
  on: [
    {
      match: yes,
      act: (session) => ({
        session,
        effects: [{ kind: "hours", weekday: weekdayOf(session)!, intervals: [] }],
      }),
      go: "salvo",
    },
    { match: no, go: "editar_dia_semana" },
  ],
};

const editarTodos: State = {
  enter: says(msg("editar_todos", { voltar: VOLTAR_TODOS })),
  back: "dias_horarios",
  on: [
    { match: option(1), go: "mudar_abertura" },
    { match: option(2), go: "mudar_fechamento" },
    { match: option(3), go: "mudar_almoco" },
    {
      match: option(4),
      act: (session) => ({ session: { ...session, draft: { todos: true, padrao: {} } } }),
      go: "igual_abre",
    },
    { match: option(VOLTAR_TODOS), go: backFrom, exits: BACK_TARGETS },
  ],
};

/** Os intervalos escritos como dado, para o texto não precisar do tipo. */
function intervalosEscritos(intervals: Interval[]): string {
  return intervals.map((i) => `${i.start}-${i.end}`).join(" ");
}

const weekdayOf = (session: Session): Weekday | undefined => session.draft.weekday;

/** Os dias que a próxima resposta vai mexer: um, ou todos os que abrem. */
function alvos(session: Session, ctx: Ctx): Weekday[] {
  const weekday = weekdayOf(session);
  if (weekday !== undefined) return [weekday];
  if (!session.draft.todos) return [];
  return SEMANA.filter((dia) => ctx.shop.hours[dia].length > 0);
}

/** O expediente que a tela mostra: o do dia, ou o do primeiro que abre. */
function expedienteDo(session: Session, ctx: Ctx): Expediente | null {
  const [primeiro] = alvos(session, ctx);
  return primeiro === undefined ? null : expedienteOf(ctx.shop.hours[primeiro]);
}

const diaAberto = (session: Session, ctx: Ctx): boolean => expedienteDo(session, ctx) !== null;
const diaFechado = (session: Session, ctx: Ctx): boolean => !diaAberto(session, ctx);

/**
 * Os agendamentos futuros que caem num dia da semana.
 *
 * Fechar um dia com gente marcada não é decisão de bot: o barbeiro precisa
 * falar com essas pessoas antes. Então o bot recusa e mostra quem são.
 */
function marcadosNoWeekday(session: Session, ctx: Ctx): Appointment[] {
  const weekday = weekdayOf(session);
  if (weekday === undefined) return [];
  return ctx.agenda.filter(
    (a) => weekdayFor(a.day) === weekday && compare({ day: a.day, at: a.start }, ctx.now) >= 0,
  );
}

const editarDiaSemana: State = {
  enter: (session, ctx) => {
    const weekday = weekdayOf(session);
    if (weekday === undefined) return { session, messages: [], go: "dias_horarios" };
    const expediente = expedienteOf(ctx.shop.hours[weekday]);
    if (!expediente) {
      return {
        session,
        messages: [msg("editar_dia_fechado", { dia: weekday, voltar: VOLTAR_DIA_FECHADO })],
      };
    }
    return {
      session,
      messages: [
        msg("editar_dia_aberto", {
          dia: weekday,
          abre: expediente.abre,
          fecha: expediente.fecha,
          almoco_de: expediente.almoco?.start ?? 0,
          almoco_ate: expediente.almoco?.end ?? 0,
          voltar: VOLTAR_DIA_ABERTO,
        }),
      ],
    };
  },
  exits: ["dias_horarios"],
  back: "dias_horarios",
  on: [
    { match: when(diaAberto, option(1)), go: "mudar_abertura" },
    { match: when(diaAberto, option(2)), go: "mudar_fechamento" },
    { match: when(diaAberto, option(3)), go: "mudar_almoco" },
    {
      // Um dia com gente marcada nem chega a perguntar: falar com essas pessoas
      // não é trabalho de bot, e essa recusa vem antes da confirmação.
      match: when(diaAberto, option(4)),
      go: (session, ctx) =>
        marcadosNoWeekday(session, ctx).length > 0 ? "dia_tem_gente" : "confirmar_fechar_semana",
      exits: ["dia_tem_gente", "confirmar_fechar_semana"],
    },
    {
      // Abrir um dia fechado copia o expediente de um dia que já está aberto:
      // uma barbearia não tem sete horários diferentes, tem um e algumas
      // exceções. Se quiser outro, os três primeiros itens estão logo ali.
      match: when(diaFechado, option(1)),
      act: (session, _match, ctx) => {
        const weekday = weekdayOf(session);
        const modelo = SEMANA.map((d) => ctx.shop.hours[d]).find((i) => i.length > 0);
        if (weekday === undefined) return { session };
        return {
          session,
          effects: [
            {
              kind: "hours",
              weekday,
              intervals: modelo ?? [{ start: 9 * 60, end: 18 * 60 }],
            },
          ],
        };
      },
      go: "editar_dia_semana",
    },
    { match: when(diaAberto, option(VOLTAR_DIA_ABERTO)), go: backFrom, exits: BACK_TARGETS },
    { match: when(diaFechado, option(VOLTAR_DIA_FECHADO)), go: backFrom, exits: BACK_TARGETS },
  ],
};

/** A hora que acabou de ser dita, para o destino poder conferi-la. */
function lembrar(session: Session, hora: number | undefined): Session {
  return hora === undefined ? session : { ...session, draft: { ...session.draft, hora } };
}

/**
 * Guarda o expediente novo, se ele fizer sentido em todos os dias que ele toca.
 *
 * Com a semana inteira como alvo, um horário que não fecha em um dia derruba a
 * mudança toda. Salvar em cinco dias e pular o sexto em silêncio é pior do que
 * recusar: o barbeiro ia embora achando que tinha mudado.
 */
function salvarExpediente(session: Session, ctx: Ctx, mudanca: Partial<Expediente>): Effect[] {
  const efeitos: Effect[] = [];
  for (const weekday of alvos(session, ctx)) {
    const atual = expedienteOf(ctx.shop.hours[weekday]);
    if (!atual) return [];
    const novo = { ...atual, ...mudanca };
    if (novo.abre >= novo.fecha) return [];
    efeitos.push({ kind: "hours", weekday, intervals: intervalsOf(novo) });
  }
  return efeitos;
}

const valido = (session: Session, ctx: Ctx, mudanca: Partial<Expediente>): boolean =>
  salvarExpediente(session, ctx, mudanca).length > 0;

const mudarAbertura: State = {
  enter: (session, ctx) => ({
    session,
    messages: [
      msg("mudar_abertura", {
        abre: expedienteDo(session, ctx)?.abre ?? 0,
        todos: session.draft.todos ? 1 : 0,
      }),
    ],
  }),
  back: "dias_horarios",
  on: [
    {
      match: anyHour,
      act: (session, match, ctx) => ({
        session: perguntou(lembrar(session, match.number), "mudar_abertura"),
        effects: salvarExpediente(session, ctx, { abre: match.number ?? 0 }),
      }),
      // Abrir depois de fechar não é um horário, é um engano.
      go: (session, ctx) => (valido(session, ctx, { abre: session.draft.hora ?? 0 }) ? "salvo" : "horario_invalido"),
      exits: ["salvo", "horario_invalido"],
    },
  ],
};

const mudarFechamento: State = {
  enter: (session, ctx) => ({
    session,
    messages: [
      msg("mudar_fechamento", {
        fecha: expedienteDo(session, ctx)?.fecha ?? 0,
        todos: session.draft.todos ? 1 : 0,
      }),
    ],
  }),
  back: "dias_horarios",
  on: [
    {
      match: anyHour,
      act: (session, match, ctx) => ({
        session: perguntou(lembrar(session, match.number), "mudar_fechamento"),
        effects: salvarExpediente(session, ctx, { fecha: match.number ?? 0 }),
      }),
      go: (session, ctx) => (valido(session, ctx, { fecha: session.draft.hora ?? 0 }) ? "salvo" : "horario_invalido"),
      exits: ["salvo", "horario_invalido"],
    },
  ],
};

const mudarAlmoco: State = {
  enter: (session, ctx) => {
    const expediente = expedienteDo(session, ctx);
    return {
      session,
      messages: [
        msg("mudar_almoco", {
          de: expediente?.almoco?.start ?? 0,
          ate: expediente?.almoco?.end ?? 0,
          tem: expediente?.almoco ? 1 : 0,
          todos: session.draft.todos ? 1 : 0,
        }),
      ],
    };
  },
  back: "dias_horarios",
  on: [
    {
      // Sem almoço o dia é um intervalo só, que é como o sábado já funciona.
      // O zero é o número que sobra, porque nenhuma hora do dia é zero.
      match: either(option(0), keyword("sem", "direto", "nenhum")),
      act: (session, _match, ctx) => ({
        session,
        effects: alvos(session, ctx).flatMap((weekday) => {
          const atual = expedienteOf(ctx.shop.hours[weekday]);
          return atual
            ? [
                {
                  kind: "hours" as const,
                  weekday,
                  intervals: intervalsOf({ abre: atual.abre, fecha: atual.fecha }),
                },
              ]
            : [];
        }),
      }),
      go: "salvo",
    },
    {
      match: anyHour,
      act: (session, match) => ({
        session: { ...session, draft: { ...session.draft, almoco: match.number ?? 0 } },
      }),
      go: "almoco_ate",
    },
  ],
};

const almocoAte: State = {
  enter: (session) => ({
    session,
    messages: [msg("almoco_ate", { de: session.draft.almoco ?? 0 })],
  }),
  back: "dias_horarios",
  on: [
    {
      match: anyHour,
      act: (session, match, ctx) => {
        const de = session.draft.almoco;
        const ate = match.number;
        if (de === undefined || ate === undefined) return { session };
        return {
          session: perguntou(lembrar(session, ate), "almoco_ate"),
          effects: salvarExpediente(session, ctx, { almoco: { start: de, end: ate } }),
        };
      },
      go: (session, ctx) =>
        session.draft.almoco !== undefined &&
        valido(session, ctx, {
          almoco: { start: session.draft.almoco, end: session.draft.hora ?? 0 },
        })
          ? "salvo"
          : "horario_invalido",
      exits: ["salvo", "horario_invalido"],
    },
  ],
};

/**
 * Deixar a semana inteira igual, em três perguntas.
 *
 * É o caso comum de uma barbearia: de segunda a sexta o dia é o mesmo, e o
 * sábado é a exceção. Fazer isso pelo editor de campo em campo são três voltas
 * pela mesma tela; aqui são três respostas seguidas e uma escrita só.
 *
 * Nada é salvo antes da última: desistir no meio não deixa metade da semana
 * com o horário novo e metade com o velho. É a mesma regra da comanda, pela
 * mesma razão.
 */
const igualAbre: State = {
  enter: says(msg("igual_abre")),
  back: "dias_horarios",
  on: [
    {
      match: anyHour,
      act: (session, match) => ({
        session: { ...session, draft: { ...session.draft, padrao: { abre: match.number ?? 0 } } },
      }),
      go: "igual_fecha",
    },
  ],
};

const igualFecha: State = {
  enter: (session) => ({
    session,
    messages: [msg("igual_fecha", { abre: session.draft.padrao?.abre ?? 0 })],
  }),
  back: "dias_horarios",
  on: [
    {
      match: anyHour,
      act: (session, match) => ({
        session: perguntou(
          {
            ...session,
            draft: {
              ...session.draft,
              padrao: { ...session.draft.padrao, fecha: match.number ?? 0 },
            },
          },
          "igual_fecha",
        ),
      }),
      go: (session) => (abreAntesDeFechar(session.draft.padrao) ? "igual_almoco" : "horario_invalido"),
      exits: ["igual_almoco", "horario_invalido"],
    },
  ],
};

const igualAlmoco: State = {
  // A pergunta repete o que já foi respondido: a corrente tem quatro perguntas
  // e nada é gravado antes da última, então quem erra no fim não pode ser
  // pego de surpresa pelo que respondeu no começo.
  enter: (session) => ({
    session,
    messages: [
      msg("igual_almoco", {
        abre: session.draft.padrao?.abre ?? 0,
        fecha: session.draft.padrao?.fecha ?? 0,
      }),
    ],
  }),
  back: "dias_horarios",
  on: [
    {
      match: either(option(0), keyword("sem", "direto", "nenhum")),
      act: (session, _match, ctx) => ({ session, effects: padraoEmTodos(session, ctx) }),
      go: "salvo",
    },
    {
      match: anyHour,
      act: (session, match) => ({
        session: {
          ...session,
          draft: {
            ...session.draft,
            padrao: {
              ...session.draft.padrao,
              almoco: { start: match.number ?? 0, end: match.number ?? 0 },
            },
          },
        },
      }),
      go: "igual_almoco_ate",
    },
  ],
};

const igualAlmocoAte: State = {
  enter: (session) => ({
    session,
    messages: [msg("almoco_ate", { de: session.draft.padrao?.almoco?.start ?? 0 })],
  }),
  back: "dias_horarios",
  on: [
    {
      match: anyHour,
      act: (session, match, ctx) => {
        const almoco = session.draft.padrao?.almoco;
        if (!almoco) return { session };
        const completo: Session = perguntou(
          {
            ...session,
            draft: {
              ...session.draft,
              padrao: { ...session.draft.padrao, almoco: { ...almoco, end: match.number ?? 0 } },
            },
          },
          "igual_almoco_ate",
        );
        return { session: completo, effects: padraoEmTodos(completo, ctx) };
      },
      go: (session, ctx) => (padraoEmTodos(session, ctx).length > 0 ? "salvo" : "horario_invalido"),
      exits: ["salvo", "horario_invalido"],
    },
  ],
};

type Padrao = NonNullable<Session["draft"]["padrao"]>;

const abreAntesDeFechar = (padrao: Padrao | undefined): boolean =>
  padrao?.abre !== undefined && padrao.fecha !== undefined && padrao.abre < padrao.fecha;

/**
 * O mesmo expediente em todos os dias que abrem.
 *
 * Um almoço que não cabe dentro do dia não vira um dia sem almoço em silêncio:
 * devolve nada, e o fluxo recusa. Perder a pausa sem ninguém avisar seria a
 * pior forma de errar aqui.
 */
function padraoEmTodos(session: Session, ctx: Ctx): Effect[] {
  const padrao = session.draft.padrao;
  if (!abreAntesDeFechar(padrao) || !padrao) return [];
  const { abre, fecha, almoco } = padrao as Required<Pick<Padrao, "abre" | "fecha">> & Padrao;
  if (almoco && (almoco.start <= abre || almoco.end >= fecha || almoco.start >= almoco.end)) {
    return [];
  }
  return alvos(session, ctx).map((weekday) => ({
    kind: "hours" as const,
    weekday,
    intervals: intervalsOf({ abre, fecha, ...(almoco ? { almoco } : {}) }),
  }));
}

// --- as datas fechadas -----------------------------------------------------

/** As folgas de hoje para a frente. As que passaram não interessam mais. */
function proximasFolgas(ctx: Ctx): Day[] {
  return ctx.shop.holidays.filter((day) => day >= ctx.now.day).sort();
}

const diasFechados: State = {
  enter: (session, ctx) => {
    const folgas = proximasFolgas(ctx);
    const lista = numbered(
      [
        ...folgas.map((day, i) => msg("item_dia_fechado", { n: i + 1, dia: day })),
        msg("item_fechar_dia", { n: folgas.length + 1 }),
      ],
      [...folgas.map((day) => ({ kind: "day", day }) as const), { kind: "novo", what: "produto" }],
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("dias_fechados", { itens: lista.itens, quantos: folgas.length })],
    };
  },
  back: "dias_horarios",
  on: [
    {
      match: choice("day"),
      act: (session, match) => ({
        session:
          match.choice?.kind === "day"
            ? { ...session, draft: { folga: match.choice.day } }
            : session,
      }),
      go: "confirmar_reabrir",
    },
    { match: choice("novo"), go: "pedir_dia_fechado" },
  ],
};

const pedirDiaFechado: State = {
  enter: says(msg("pedir_dia_fechado")),
  back: "dias_horarios",
  on: [
    {
      match: someDay,
      act: (session, match, ctx) => {
        if (match.choice?.kind !== "day") return { session };
        const day = match.choice.day;
        const guardado: Session = { ...session, draft: { folga: day } };
        return marcadosNoDia(day, ctx).length > 0
          ? { session: guardado }
          : { session: guardado, effects: [{ kind: "close_day", day }] };
      },
      go: (session, ctx) =>
        marcadosNoDia(session.draft.folga ?? "", ctx).length > 0 ? "dia_tem_gente" : "dia_fechado",
      exits: ["dia_tem_gente", "dia_fechado"],
    },
  ],
};

function marcadosNoDia(day: Day, ctx: Ctx): Appointment[] {
  return ctx.agenda.filter((a) => a.day === day);
}

const diaTemGente: State = {
  enter: (session, ctx) => {
    const day = session.draft.folga;
    const marcados = day ? marcadosNoDia(day, ctx) : marcadosNoWeekday(session, ctx);
    return {
      session,
      messages: [
        msg("dia_tem_gente", {
          itens: marcados.map((a) =>
            msg("item_marcado_no_dia", {
              dia: a.day,
              hora: a.start,
              nome: a.clientName,
              servico: serviceName(ctx, a.serviceId),
            }),
          ),
        }),
      ],
    };
  },
  goto: "dias_horarios",
};

const confirmarReabrir: State = {
  enter: (session) => ({
    session,
    messages: [msg("confirmar_reabrir", { dia: session.draft.folga ?? "" })],
  }),
  back: "dias_horarios",
  on: [
    {
      match: yes,
      act: (session) => {
        const day = session.draft.folga;
        return day ? { session, effects: [{ kind: "open_day", day }] } : { session };
      },
      go: "dias_fechados",
    },
    { match: no, go: "dias_fechados" },
  ],
};

// --- as horas travadas -----------------------------------------------------

/**
 * Travar um pedaço de um dia.
 *
 * É o irmão pequeno do dia fechado: `holidays` tira um dia inteiro da conta de
 * horas livres, e um bloqueio tira um intervalo de um dia que abre. O barbeiro
 * tem médico às três da sexta, e nada mais precisa acontecer, nem cancelar
 * horário, nem mexer no expediente da semana.
 *
 * A conta do outro lado não mudou: `freeSlots` já subtraía intervalos ocupados,
 * e um bloqueio entrou nessa lista junto com os agendamentos. Por isso não
 * existe nada aqui sobre o menu do cliente.
 */
const bloqueios: State = {
  enter: (session, ctx) => {
    const travados = upcomingBlocks(ctx.shop, ctx.now);
    const lista = numbered(
      [
        ...travados.map((block, i) =>
          msg("item_bloqueio", { n: i + 1, dia: block.day, de: block.start, ate: block.end }),
        ),
        msg("item_bloquear", { n: travados.length + 1 }),
      ],
      [
        ...travados.map(
          (block) => ({ kind: "bloqueio", day: block.day, start: block.start }) as const,
        ),
        { kind: "novo", what: "produto" },
      ],
    );
    return {
      session: { ...session, choices: lista.choices },
      messages: [msg("bloqueios", { itens: lista.itens, quantos: travados.length })],
    };
  },
  on: [
    {
      // Escolher um travado destrava, como escolher uma data fechada reabre.
      match: choice("bloqueio"),
      act: (session, match) =>
        match.choice?.kind === "bloqueio"
          ? {
              session: {
                ...session,
                draft: { bloqueio: { day: match.choice.day, start: match.choice.start } },
              },
              effects: [
                { kind: "unblock" as const, day: match.choice.day, start: match.choice.start },
              ],
            }
          : { session },
      go: "desbloqueado",
    },
    { match: choice("novo"), go: "pedir_dia_bloqueio" },
  ],
};

const pedirDiaBloqueio: State = {
  enter: says(msg("pedir_dia_bloqueio")),
  back: "bloqueios",
  on: [
    {
      match: someDay,
      act: (session, match) => ({
        session:
          match.choice?.kind === "day"
            ? { ...session, draft: { bloqueio: { day: match.choice.day } } }
            : session,
      }),
      go: "pedir_inicio_bloqueio",
    },
  ],
};

const pedirInicioBloqueio: State = {
  enter: (session) => ({
    session,
    messages: [msg("pedir_inicio_bloqueio", { dia: session.draft.bloqueio?.day ?? "" })],
  }),
  back: "bloqueios",
  on: [
    {
      match: anyHour,
      act: (session, match) => ({
        session: {
          ...session,
          draft: { bloqueio: { ...session.draft.bloqueio, start: match.number ?? 0 } },
        },
      }),
      go: "pedir_fim_bloqueio",
    },
  ],
};

/** Quem está marcado dentro do pedaço que se quer travar. */
function marcadosNaHora(day: Day, interval: Interval, ctx: Ctx): Appointment[] {
  return ctx.agenda.filter(
    (a) => a.day === day && overlaps({ start: a.start, end: a.start + a.minutes }, interval),
  );
}

/**
 * A última pergunta, e a única que escreve.
 *
 * Três coisas podem sair daqui: o bloqueio, a recusa por horário que não fecha,
 * e a recusa por gente marcada dentro dele. As duas recusas não escrevem nada ,
 * travar por cima de um agendamento seria desmarcar alguém sem avisar, que é
 * exatamente o que o bot não pode fazer com uma tecla.
 */
const pedirFimBloqueio: State = {
  enter: (session) => ({
    session,
    messages: [msg("pedir_fim_bloqueio", { de: session.draft.bloqueio?.start ?? 0 })],
  }),
  back: "bloqueios",
  on: [
    {
      match: anyHour,
      act: (session, match, ctx) => {
        const rascunho = session.draft.bloqueio;
        const day = rascunho?.day;
        const start = rascunho?.start;
        const end = match.number ?? 0;
        const guardado: Session = { ...session, draft: { bloqueio: { ...rascunho, start: end } } };
        if (day === undefined || start === undefined || end <= start) return { session: guardado };

        const bloqueio: Session = {
          ...session,
          draft: { bloqueio: { day, start }, hora: end },
        };
        return marcadosNaHora(day, { start, end }, ctx).length > 0
          ? { session: bloqueio }
          : { session: bloqueio, effects: [{ kind: "block", block: { day, start, end } }] };
      },
      go: (session, ctx) => {
        const { day, start } = session.draft.bloqueio ?? {};
        const end = session.draft.hora;
        if (day === undefined || start === undefined || end === undefined) return "hora_invalida";
        return marcadosNaHora(day, { start, end }, ctx).length > 0 ? "hora_tem_gente" : "bloqueado";
      },
      exits: ["bloqueado", "hora_invalida", "hora_tem_gente"],
    },
  ],
};

const bloqueado: State = {
  enter: (session) => ({
    session,
    messages: [
      msg("bloqueado", {
        dia: session.draft.bloqueio?.day ?? "",
        de: session.draft.bloqueio?.start ?? 0,
        ate: session.draft.hora ?? 0,
      }),
    ],
  }),
  goto: "bloqueios",
};

const desbloqueado: State = {
  enter: (session) => ({
    session,
    messages: [
      msg("desbloqueado", {
        dia: session.draft.bloqueio?.day ?? "",
        de: session.draft.bloqueio?.start ?? 0,
      }),
    ],
  }),
  goto: "bloqueios",
};

const horaTemGente: State = {
  enter: (session, ctx) => {
    const { day, start } = session.draft.bloqueio ?? {};
    const end = session.draft.hora ?? 0;
    const marcados =
      day === undefined || start === undefined
        ? []
        : marcadosNaHora(day, { start, end }, ctx);
    return {
      session,
      messages: [
        msg("hora_tem_gente", {
          itens: marcados.map((a) =>
            msg("item_marcado_no_dia", {
              dia: a.day,
              hora: a.start,
              nome: a.clientName,
              servico: serviceName(ctx, a.serviceId),
            }),
          ),
        }),
      ],
    };
  },
  goto: "bloqueios",
};

// --- o relatório -----------------------------------------------------------

/**
 * Um relatório é sempre o mesmo estado com outro intervalo.
 *
 * O intervalo é calculado na entrada, a partir do relógio, e não guardado no
 * rascunho: perguntar "e o mês?" é uma conta, não uma memória.
 */
function relatorioDe(range: (session: Session, ctx: Ctx) => Range): Enter {
  return (session, ctx) => {
    const periodo = range(session, ctx);
    const numeros = report(ctx.comandas, periodo);

    if (numeros.atendimentos === 0 && numeros.faltas === 0) {
      return {
        session,
        messages: [msg("relatorio_vazio", { de: periodo.from, ate: periodo.to })],
      };
    }

    const linhas = (de: typeof numeros.porServico): Message[] =>
      de.map((linha) =>
        msg("linha_item", {
          nome: linha.name,
          quantidade: linha.quantidade,
          total: linha.total,
        }),
      );
    const pagamentos: Message[] = numeros.porPagamento.map((linha) =>
      msg("linha_pagamento", {
        forma: linha.payment,
        quantidade: linha.quantidade,
        total: linha.total,
      }),
    );

    return {
      session,
      messages: [
        msg("relatorio", {
          de: periodo.from,
          ate: periodo.to,
          faturado: numeros.faturado,
          atendimentos: numeros.atendimentos,
          faltas: numeros.faltas,
          em_servicos: numeros.emServicos,
          em_produtos: numeros.emProdutos,
          servicos: linhas(numeros.porServico),
          produtos: linhas(numeros.porProduto),
          pagamentos,
        }),
      ],
    };
  };
}

const menuRelatorio: State = {
  enter: says(msg("menu_relatorio", { voltar: VOLTAR_RELATORIO })),
  on: [
    { match: option(1), go: "relatorio_hoje" },
    { match: option(2), go: "relatorio_semana" },
    { match: option(3), go: "relatorio_mes" },
    {
      // O pedido de dia é um estado só, e o rascunho diz de onde ele veio.
      match: option(4),
      act: (session) => ({ session: { ...session, draft: { ...session.draft, asking: "relatorio" } } }),
      go: "pedir_dia",
    },
    { match: option(VOLTAR_RELATORIO), go: backFrom, exits: BACK_TARGETS },
  ],
};

const menuBarbeiro: State = {
  enter: (session) => ({ session: clearDraft(session), messages: [msg("menu_barbeiro")] }),
  on: [
    {
      match: option(1),
      act: (session, _match, ctx) => ({
        session: { ...session, draft: { ...session.draft, looking: ctx.now.day } },
      }),
      go: "agenda",
    },
    { match: option(2), go: "pedir_dia" },
    { match: option(3), go: "comandas" },
    { match: option(4), go: "menu_relatorio" },
    { match: option(5), go: "catalogo" },
    { match: option(6), go: "dias_horarios" },
    { match: option(7), go: "bloqueios" },
  ],
};

export const BARBEIRO: Flow = {
  advance,
  start: "inicio_barbeiro",
  // O barbeiro não fica preso: se ele digitar três coisas que o bot não
  // entende, o lugar para onde mandá-lo é o menu, não um humano, ele é o humano.
  stuck: "menu_barbeiro",
  missLimit: 3,
  global: [
    { match: keyword("menu", "opcoes"), go: "menu_barbeiro" },
    // A última linha de toda lista, posta por `numbered()` e atendida aqui.
    { match: choice("voltar"), go: backFrom, exits: BACK_TARGETS },
    { match: keyword("voltar"), go: backFrom, exits: BACK_TARGETS },
    { match: keyword("sair", "tchau", "encerrar"), go: "despedida_barbeiro" },
  ],
  states: {
    inicio_barbeiro: { enter: silent, on: [{ match: anything, go: "saudacao_barbeiro" }] },
    saudacao_barbeiro: { enter: says(msg("saudacao_barbeiro")), goto: "menu_barbeiro" },
    menu_barbeiro: menuBarbeiro,
    despedida_barbeiro: { enter: says(msg("despedida_barbeiro")), goto: "inicio_barbeiro" },

    agenda,
    pedir_dia: pedirDia,

    comandas,
    nada_a_fechar: { enter: says(msg("nada_a_fechar")), goto: "menu_barbeiro" },
    compareceu,
    comanda,
    servico_extra: servicoExtra,
    produto_extra: produtoExtra,
    escolher_item: escolherItem,
    pedir_valor: pedirValor,
    escolher_pagamento: escolherPagamento,
    comanda_fechada: comandaFechada,
    comanda_faltou: comandaFaltou,

    catalogo,
    editar_item: editarItem,
    mudar_preco: mudarPreco,
    mudar_tempo: mudarTempo,
    confirmar_tirar: confirmarTirar,
    novo_nome: novoNome,
    novo_preco: novoPreco,
    novo_tempo: novoTempo,
    escolher_categoria: escolherCategoria,
    // Depois de mexer, a lista de novo: é ela que prova que mudou. Qual lista
    // depende do que estava sendo mexido, e é o rascunho que sabe disso.
    salvo: {
      enter: (session) => ({
        session,
        messages: [msg("salvo")],
        go:
          session.draft.weekday === undefined && !session.draft.todos
            ? "catalogo"
            : "dias_horarios",
      }),
      exits: ["catalogo", "dias_horarios"],
    },
    tirado: { enter: says(msg("tirado")), goto: "catalogo" },

    dias_horarios: diasHorarios,
    editar_dia_semana: editarDiaSemana,
    confirmar_fechar_semana: confirmarFecharSemana,
    editar_todos: editarTodos,
    igual_abre: igualAbre,
    igual_fecha: igualFecha,
    igual_almoco: igualAlmoco,
    igual_almoco_ate: igualAlmocoAte,
    mudar_abertura: mudarAbertura,
    mudar_fechamento: mudarFechamento,
    mudar_almoco: mudarAlmoco,
    almoco_ate: almocoAte,
    /**
     * O erro devolve na pergunta que o produziu, e não no topo do ramo.
     *
     * Antes ele caía na lista da semana, e quem estava sete respostas adiante
     * em "deixar todos iguais" perdia as seis certas junto com a errada. O
     * rascunho não é apagado: só a resposta recusada não entrou nele, então
     * repetir a pergunta continua de onde parou.
     */
    horario_invalido: {
      enter: (session) => ({
        session,
        messages: [msg("horario_invalido")],
        go:
          session.draft.pergunta ??
          (session.draft.weekday === undefined ? "dias_horarios" : "editar_dia_semana"),
      }),
      exits: [
        "mudar_abertura",
        "mudar_fechamento",
        "almoco_ate",
        "igual_fecha",
        "igual_almoco_ate",
        "dias_horarios",
        "editar_dia_semana",
      ],
    },
    bloqueios,
    pedir_dia_bloqueio: pedirDiaBloqueio,
    pedir_inicio_bloqueio: pedirInicioBloqueio,
    pedir_fim_bloqueio: pedirFimBloqueio,
    bloqueado,
    desbloqueado,
    hora_tem_gente: horaTemGente,
    hora_invalida: { enter: says(msg("hora_invalida")), goto: "bloqueios" },

    dias_fechados: diasFechados,
    pedir_dia_fechado: pedirDiaFechado,
    dia_fechado: { enter: says(msg("dia_fechado")), goto: "dias_fechados" },
    dia_tem_gente: diaTemGente,
    confirmar_reabrir: confirmarReabrir,

    menu_relatorio: menuRelatorio,
    relatorio_hoje: { enter: relatorioDe((_s, ctx) => dayRange(ctx.now.day)), goto: "menu_barbeiro" },
    relatorio_semana: { enter: relatorioDe((_s, ctx) => weekRange(ctx.now.day)), goto: "menu_barbeiro" },
    relatorio_mes: { enter: relatorioDe((_s, ctx) => monthRange(ctx.now.day)), goto: "menu_barbeiro" },
    relatorio_dia: {
      enter: relatorioDe((session, ctx) => dayRange(looking(session, ctx))),
      goto: "menu_barbeiro",
    },
  },
};
