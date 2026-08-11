/**
 * A comanda: o que de fato aconteceu num horário marcado.
 *
 * A agenda é uma promessa e a comanda é o registro. São duas coisas diferentes
 * de propósito: o agendamento diz que às 14:00 de quarta o Zé vem cortar o
 * cabelo, e a comanda diz que ele veio (ou não), que saiu um corte e um
 * pezinho, que deu R$ 65,00 e que pagou no pix.
 *
 * Por isso a comanda copia o preço em vez de apontar para o serviço: a tabela
 * de preços de `shop.ts` muda quando o barbeiro quiser, e um aumento em outubro
 * não pode reescrever o faturamento de agosto. Pelo mesmo motivo ela copia o
 * nome do cliente. O relatório lê comandas e nunca a tabela de preços.
 *
 * Dinheiro é sempre inteiro, em centavos. Nenhum valor deste projeto passa por
 * um `float`.
 */

import type { Appointment } from "./agenda.ts";
import type { PaymentId, Product, Service, Shop } from "./shop.ts";
import { serviceById } from "./shop.ts";
import type { Day, Minutes, Moment } from "./time.ts";
import { compare } from "./time.ts";

/**
 * Uma linha da comanda: um serviço feito ou um produto levado.
 *
 * O preço fica na linha, não no catálogo, porque o barbeiro pode cobrar
 * diferente do combinado: um desconto para o cliente antigo, um corte que virou
 * corte e barba, uma gorjeta somada no cartão.
 *
 * O nome também é copiado, pela mesma razão. O catálogo é editável pelo bot: o
 * refrigerante pode sair da lista em outubro, e o relatório de agosto continua
 * tendo que saber dizer que naquele mês saíram seis refrigerantes. Uma linha de
 * comanda é um fato acontecido, e um fato não muda quando a lista muda.
 */
export type Item = {
  kind: "servico" | "produto";
  /** Do serviço ou do produto, para o relatório agrupar. */
  id: string;
  /** Como se chamava quando foi vendido. */
  name: string;
  price: number;
};

export type Status = "feito" | "faltou";

export type Comanda = {
  /** O mesmo id do agendamento: uma comanda fecha um horário, e só um. */
  id: string;
  day: Day;
  start: Minutes;
  phone: string;
  clientName: string;
  status: Status;
  /** Vazio quando o cliente faltou. */
  itens: Item[];
  /** A soma dos itens, guardada porque é o que o relatório soma. */
  total: number;
  /** Ausente quando o cliente faltou: não houve o que pagar. */
  payment?: PaymentId;
  /** Quando o barbeiro fechou, que não é a hora do atendimento. */
  closedAt: Moment;
};

export function totalOf(itens: Item[]): number {
  return itens.reduce((sum, item) => sum + item.price, 0);
}

/**
 * A comanda que um agendamento sugere antes de o barbeiro mexer.
 *
 * O agendado entra como primeira linha, pelo preço de tabela. Fechar sem mudar
 * nada é o caminho de sempre, e é o que tem que custar menos toques.
 */
export function itemsFor(shop: Shop, appointment: Appointment): Item[] {
  const service = serviceById(shop, appointment.serviceId);
  return [service ? itemFor(service) : { kind: "servico", id: appointment.serviceId, name: appointment.serviceId, price: 0 }];
}

export function itemFor(service: Service): Item {
  return { kind: "servico", id: service.id, name: service.name, price: service.price };
}

export function itemForProduct(product: Product): Item {
  return { kind: "produto", id: product.id, name: product.name, price: product.price };
}

export function comandaById(comandas: Comanda[], id: string): Comanda | null {
  return comandas.find((c) => c.id === id) ?? null;
}

export function isClosed(comandas: Comanda[], id: string): boolean {
  return comandas.some((c) => c.id === id);
}

/**
 * Os atendimentos que já começaram e ninguém fechou.
 *
 * É a lista de trabalho do barbeiro, e ela sai de uma subtração: a agenda até
 * agora, menos o que já tem comanda. Nada guarda "pendente" em lugar nenhum,
 * então não existe estado para dessincronizar.
 */
export function pending(
  agenda: Appointment[],
  comandas: Comanda[],
  now: Moment,
): Appointment[] {
  return agenda
    .filter((a) => compare({ day: a.day, at: a.start }, now) <= 0 && !isClosed(comandas, a.id))
    .sort((a, b) => compare({ day: a.day, at: a.start }, { day: b.day, at: b.start }));
}

/**
 * As comandas de um intervalo de dias, com as duas pontas dentro.
 *
 * `YYYY-MM-DD` ordena como texto na mesma ordem em que ordena como data, que é
 * a razão de o dia ser escrito assim e não como `10/08/2026`.
 */
export function between(comandas: Comanda[], from: Day, to: Day): Comanda[] {
  return comandas
    .filter((c) => c.day >= from && c.day <= to)
    .sort((a, b) => compare({ day: a.day, at: a.start }, { day: b.day, at: b.start }));
}
