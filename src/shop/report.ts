/**
 * O relatório: as comandas somadas.
 *
 * É a única parte do projeto que responde uma pergunta em vez de conduzir uma
 * conversa, e mesmo assim é uma função pura de dado para dado. Ela recebe as
 * comandas de um intervalo e devolve números; quem escreve "R$ 385,00" é
 * `src/text/ptbr.ts`, como sempre.
 *
 * Nada aqui lê a tabela de preços. O preço já está dentro de cada comanda,
 * copiado no fechamento, e é essa cópia que faz um aumento de preço em outubro
 * não reescrever o faturamento de agosto.
 */

import type { Comanda, Item } from "./comanda.ts";
import { between } from "./comanda.ts";
import type { PaymentId } from "./shop.ts";
import type { Day } from "./time.ts";
import { addDays, format, parts, weekday } from "./time.ts";

/** Um intervalo de dias, com as duas pontas dentro. */
export type Range = { from: Day; to: Day };

export type ByItem = {
  kind: Item["kind"];
  id: string;
  name: string;
  quantidade: number;
  total: number;
};
export type ByPayment = { payment: PaymentId; quantidade: number; total: number };

export type Report = {
  range: Range;
  /** Comandas fechadas como "feito". */
  atendimentos: number;
  faltas: number;
  /** Em centavos, tudo somado. */
  faturado: number;
  /**
   * O mesmo total, partido em dois.
   *
   * Serviço é tempo de cadeira e produto é estoque, e o barbeiro decide coisas
   * diferentes com cada número: quanto rendeu a mão dele e quanto rendeu a
   * prateleira.
   */
  emServicos: number;
  emProdutos: number;
  porServico: ByItem[];
  porProduto: ByItem[];
  porPagamento: ByPayment[];
};

export function report(comandas: Comanda[], range: Range): Report {
  const doPeriodo = between(comandas, range.from, range.to);
  const feitas = doPeriodo.filter((c) => c.status === "feito");

  // As linhas são agrupadas pelo id, e o nome vem da própria linha: o catálogo
  // pode ter mudado desde então, e o relatório fala do que aconteceu.
  const itens = new Map<string, ByItem>();
  for (const comanda of feitas) {
    for (const item of comanda.itens) {
      const chave = `${item.kind}:${item.id}`;
      const linha = itens.get(chave) ?? {
        kind: item.kind,
        id: item.id,
        name: item.name,
        quantidade: 0,
        total: 0,
      };
      linha.quantidade += 1;
      linha.total += item.price;
      itens.set(chave, linha);
    }
  }
  const maiorPrimeiro = (a: ByItem, b: ByItem) => b.total - a.total;
  const porServico = [...itens.values()].filter((l) => l.kind === "servico").sort(maiorPrimeiro);
  const porProduto = [...itens.values()].filter((l) => l.kind === "produto").sort(maiorPrimeiro);

  const pagamentos = new Map<PaymentId, ByPayment>();
  for (const comanda of feitas) {
    if (!comanda.payment) continue;
    const linha = pagamentos.get(comanda.payment) ?? {
      payment: comanda.payment,
      quantidade: 0,
      total: 0,
    };
    linha.quantidade += 1;
    linha.total += comanda.total;
    pagamentos.set(comanda.payment, linha);
  }

  return {
    range,
    atendimentos: feitas.length,
    faltas: doPeriodo.length - feitas.length,
    faturado: feitas.reduce((sum, c) => sum + c.total, 0),
    emServicos: soma(porServico),
    emProdutos: soma(porProduto),
    // O que rendeu mais primeiro: é a primeira linha que o barbeiro lê.
    porServico,
    porProduto,
    porPagamento: [...pagamentos.values()].sort((a, b) => b.total - a.total),
  };
}

const soma = (linhas: ByItem[]): number => linhas.reduce((total, linha) => total + linha.total, 0);

// --- os intervalos que o barbeiro pede ------------------------------------

export function dayRange(day: Day): Range {
  return { from: day, to: day };
}

/**
 * A semana de segunda a domingo.
 *
 * `weekday` conta a partir do domingo, como o resto do mundo do JavaScript, e
 * a semana da barbearia começa na segunda. O `+ 6` roda o círculo um dia para
 * trás, então domingo (0) vira o sexto dia da semana em vez do primeiro.
 */
export function weekRange(day: Day): Range {
  const from = addDays(day, -((weekday(day) + 6) % 7));
  return { from, to: addDays(from, 6) };
}

/** O mês do calendário, do dia 1 ao último, sem tabela de tamanho de mês. */
export function monthRange(day: Day): Range {
  const { year, month } = parts(day);
  const from = format({ year, month, day: 1 });
  const next = month === 12 ? format({ year: year + 1, month: 1, day: 1 }) : format({ year, month: month + 1, day: 1 });
  return { from, to: addDays(next, -1) };
}
