/**
 * Encher o banco para poder olhar para ele.
 *
 * Um simulador vazio só mostra o caminho feliz de um cliente só. As duas
 * semeaduras daqui existem para as duas telas terem o que mostrar:
 *
 * - **futuro** ocupa alguns horários dos próximos dias, para os horários livres
 *   do cliente deixarem de ser a grade inteira e o cálculo ficar visível;
 * - **histórico** enche os últimos dias de atendimentos, a maioria já com
 *   comanda fechada, para o barbeiro ter relatório para ler e comanda para
 *   fechar sem precisar esperar uma semana acontecer.
 *
 * As duas devolvem `Effect[]` em vez de escreverem, como o motor faz. Não é
 * cerimônia: é o que deixa a semeadura passar pelo mesmo `write()` que uma
 * conversa de verdade, então nada aqui pode produzir um banco que uma conversa
 * não produziria.
 *
 * Nenhuma delas sorteia nada. `Math.random()` daria um simulador diferente a
 * cada clique, e um bug que só aparece com o quarto cliente da segunda-feira é
 * um bug que ninguém consegue mostrar para outra pessoa. As variações são
 * rotações sobre listas, e o mesmo clique no mesmo dia dá sempre o mesmo banco.
 */

import type { Appointment, Effect } from "../shop/agenda.ts";
import { appointmentId } from "../shop/agenda.ts";
import type { Comanda, Item } from "../shop/comanda.ts";
import { itemFor, itemForProduct, totalOf } from "../shop/comanda.ts";
import type { Service, Shop } from "../shop/shop.ts";
import { serviceById } from "../shop/shop.ts";
import { daysWithSlots, freeSlots, isOpen } from "../shop/slots.ts";
import type { Day, Moment } from "../shop/time.ts";
import { addDays, compare } from "../shop/time.ts";
import type { Db } from "../store.ts";
import { write } from "../store.ts";

/** Os fregueses da casa. Nomes curtos, porque eles aparecem em lista. */
const CLIENTES = [
  { nome: "Zé", phone: "5511922222222" },
  { nome: "Marcos", phone: "5511933333333" },
  { nome: "João", phone: "5511944444444" },
  { nome: "Bruno", phone: "5511955555555" },
  { nome: "Tiago", phone: "5511966666666" },
];

/** Onde no dia cada atendimento cai, como fração da lista de horários livres. */
const ESPALHADOS = [0, 0.3, 0.55, 0.8];

/** Quantos dias para trás o histórico vai. */
const DIAS_ATRAS = 12;

/**
 * Alguns horários dos próximos dias, marcados por outras pessoas.
 *
 * É o que faz a lista de horários livres do cliente ter buracos, que é o que
 * torna o cálculo de `freeSlots` visível na tela.
 */
export function futuro(shop: Shop, db: Db, now: Moment): Effect[] {
  const corte = serviceById(shop, "corte")!;
  const barba = serviceById(shop, "barba")!;
  const days = daysWithSlots(shop, db.agenda, corte, now, 2);

  let agenda = db.agenda;
  const efeitos: Effect[] = [];

  for (const [i, day] of days.entries()) {
    const service = i === 0 ? corte : barba;
    for (const [j, fatia] of [0.15, 0.5, 0.85].entries()) {
      const start = escolher(freeSlots(shop, agenda, day, service, now), fatia);
      if (start === undefined) continue;
      const cliente = CLIENTES[(i * 3 + j) % CLIENTES.length]!;
      const appointment = marcar(day, start, service, cliente);
      agenda = [...agenda, appointment];
      efeitos.push({ kind: "book", appointment });
    }
  }
  return efeitos;
}

/**
 * Os últimos dias já vividos: atendimentos e comandas.
 *
 * Os dias que passaram saem todos fechados, para o relatório ter o que somar. O
 * dia de hoje só recebe os horários que já aconteceram, e eles ficam em aberto
 * de propósito — é a lista que "3 - Fechar comanda" precisa ter.
 */
export function historico(shop: Shop, db: Db, now: Moment): Effect[] {
  let atual = db;
  const efeitos: Effect[] = [];
  let n = 0;

  for (let atras = DIAS_ATRAS; atras >= 0; atras--) {
    const day = addDays(now.day, -atras);
    if (!isOpen(shop, day)) continue;
    const passado = day !== now.day;

    for (const fatia of ESPALHADOS) {
      // Cada dia tem um tamanho, e quem já está marcado conta. É o que faz
      // clicar duas vezes não empilhar um segundo turno de atendimentos nos
      // buracos que sobraram, sem pular um dia onde o cliente já marcou —
      // esse dia é justamente o que o barbeiro quer ver cheio.
      //
      // Clicar de novo pode completar um dia que ficou curto (hoje, onde só
      // entra o que já terminou), e aí para: o limite é por dia, não por
      // clique, e é ele que garante que nada cresce sem fim.
      if (atual.agenda.filter((a) => a.day === day).length >= ESPALHADOS.length) break;

      const service = shop.services[n % shop.services.length]!;
      // O relógio da semeadura é a meia-noite daquele dia: para trás, o que
      // interessa é a grade inteira, e não o que ainda dá para marcar. Hoje só
      // conta o que já terminou, e o corte é na lista de candidatos, antes de
      // escolher: cortar depois deixaria o dia com menos gente do que cabe, e
      // o clique seguinte viria completar o que este deixou passar.
      const livres = freeSlots(shop, atual.agenda, day, service, { day, at: 0 }).filter(
        (start) => passado || compare({ day, at: start + service.minutes }, now) <= 0,
      );
      const start = escolher(livres, fatia);
      if (start === undefined) continue;

      const cliente = CLIENTES[n % CLIENTES.length]!;
      const appointment = marcar(day, start, service, cliente);
      const novos: Effect[] = [{ kind: "book", appointment }];

      // Hoje fica em aberto para o barbeiro ter o que fechar.
      if (passado) novos.push({ kind: "close", comanda: fechar(shop, appointment, n, now) });

      atual = write(atual, novos);
      efeitos.push(...novos);
      n += 1;
    }
  }
  return efeitos;
}

function marcar(
  day: Day,
  start: number,
  service: Service,
  cliente: { nome: string; phone: string },
): Appointment {
  return {
    id: appointmentId(cliente.phone, day, start),
    day,
    start,
    minutes: service.minutes,
    serviceId: service.id,
    clientName: cliente.nome,
    phone: cliente.phone,
  };
}

/**
 * A comanda daquele atendimento, variando pela posição na sequência.
 *
 * Um em cada sete faltou, um em cada quatro levou um pezinho junto, um em cada
 * três levou alguma coisa da prateleira e a forma de pagamento gira: é o
 * suficiente para o relatório ter linhas diferentes em vez de quatro cortes
 * iguais pagos em dinheiro.
 */
function fechar(shop: Shop, appointment: Appointment, n: number, now: Moment): Comanda {
  const registro = {
    id: appointment.id,
    day: appointment.day,
    start: appointment.start,
    phone: appointment.phone,
    clientName: appointment.clientName,
    // Quem fecha, fecha depois. A hora é a do fim do atendimento.
    closedAt: { day: appointment.day, at: appointment.start + appointment.minutes },
  };

  if (n % 7 === 6) {
    return { ...registro, status: "faltou", itens: [], total: 0 };
  }

  const service = serviceById(shop, appointment.serviceId)!;
  const itens: Item[] = [itemFor(service)];

  // Um em cada quatro levou um pezinho junto, e um em cada três levou alguma
  // coisa da prateleira: sem isso o relatório de produtos nasce vazio.
  const pezinho = serviceById(shop, "pezinho");
  if (n % 4 === 3 && pezinho && pezinho.id !== service.id) itens.push(itemFor(pezinho));
  const product = shop.products[n % shop.products.length];
  if (n % 3 === 0 && product) itens.push(itemForProduct(product));

  return {
    ...registro,
    status: "feito",
    itens,
    total: totalOf(itens),
    payment: shop.payments[n % shop.payments.length]!,
    closedAt: compare(registro.closedAt, now) > 0 ? now : registro.closedAt,
  };
}

/** O horário a tantos por cento da lista, em vez dos primeiros sempre. */
function escolher(livres: number[], fatia: number): number | undefined {
  if (livres.length === 0) return undefined;
  return livres[Math.min(livres.length - 1, Math.floor(livres.length * fatia))];
}
