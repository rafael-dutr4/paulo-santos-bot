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

import type { Comanda } from "./comanda.ts";
import { between } from "./comanda.ts";
import type { PaymentId, ServiceId } from "./shop.ts";
import type { Day } from "./time.ts";
import { addDays, format, parts, weekday } from "./time.ts";

/** Um intervalo de dias, com as duas pontas dentro. */
export type Range = { from: Day; to: Day };

export type ByService = { serviceId: ServiceId; quantidade: number; total: number };
export type ByPayment = { payment: PaymentId; quantidade: number; total: number };

export type Report = {
  range: Range;
  /** Comandas fechadas como "feito". */
  atendimentos: number;
  faltas: number;
  /** Em centavos. */
  faturado: number;
  porServico: ByService[];
  porPagamento: ByPayment[];
};

export function report(comandas: Comanda[], range: Range): Report {
  const doPeriodo = between(comandas, range.from, range.to);
  const feitas = doPeriodo.filter((c) => c.status === "feito");

  const servicos = new Map<ServiceId, ByService>();
  for (const comanda of feitas) {
    for (const item of comanda.itens) {
      const linha = servicos.get(item.serviceId) ?? {
        serviceId: item.serviceId,
        quantidade: 0,
        total: 0,
      };
      linha.quantidade += 1;
      linha.total += item.price;
      servicos.set(item.serviceId, linha);
    }
  }

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
    // O que rendeu mais primeiro: é a primeira linha que o barbeiro lê.
    porServico: [...servicos.values()].sort((a, b) => b.total - a.total),
    porPagamento: [...pagamentos.values()].sort((a, b) => b.total - a.total),
  };
}

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
