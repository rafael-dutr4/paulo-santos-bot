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
import type { PaymentId, Service, ServiceId, Shop } from "./shop.ts";
import { serviceById } from "./shop.ts";
import type { Day, Minutes, Moment } from "./time.ts";
import { compare } from "./time.ts";

/**
 * Uma linha da comanda.
 *
 * O preço fica na linha, não no serviço, porque o barbeiro pode cobrar
 * diferente do combinado: um desconto para o cliente antigo, um corte que virou
 * corte e barba, uma gorjeta somada no cartão.
 */
export type Item = { serviceId: ServiceId; price: number };

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
  return [{ serviceId: appointment.serviceId, price: service?.price ?? 0 }];
}

export function itemFor(service: Service): Item {
  return { serviceId: service.id, price: service.price };
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
