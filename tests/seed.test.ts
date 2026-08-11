import test from "node:test";
import assert from "node:assert/strict";

import { pending } from "../src/shop/comanda.ts";
import { monthRange, report } from "../src/shop/report.ts";
import { SHOP } from "../src/shop/shop.ts";
import { weekday } from "../src/shop/time.ts";
import { emptyDb, write } from "../src/store.ts";
import { futuro, historico } from "../src/sim/seed.ts";

/**
 * A semeadura não toca o DOM, então ela roda aqui como qualquer módulo puro.
 * O que estes testes protegem é a promessa que ela faz ao simulador: depois de
 * um clique existe relatório para ler e comanda para fechar.
 */

const AGORA = { day: "2026-08-11", at: 15 * 60 }; // uma terça, meio da tarde

const semeado = () => write(emptyDb(), historico(SHOP, emptyDb(), AGORA));

test("o histórico enche os dias que passaram, com comanda fechada", () => {
  const db = semeado();
  assert.ok(db.agenda.length > 10, "poucos atendimentos para olhar");

  const passados = db.agenda.filter((a) => a.day < AGORA.day);
  const fechados = passados.filter((a) => db.comandas.some((c) => c.id === a.id));
  assert.equal(fechados.length, passados.length, "dia que passou não fica em aberto");
});

test("o dia de hoje fica em aberto, que é o trabalho do barbeiro", () => {
  const db = semeado();
  const abertas = pending(db.agenda, db.comandas, AGORA);
  assert.ok(abertas.length > 0, "sem isso, 'fechar comanda' não tem o que listar");
  assert.ok(
    abertas.every((a) => a.day === AGORA.day),
    "só o dia de hoje fica pendente",
  );
});

test("nada é marcado num dia fechado nem depois da hora", () => {
  const db = semeado();
  for (const appointment of db.agenda) {
    assert.ok(
      SHOP.hours[weekday(appointment.day)].length > 0,
      `${appointment.day} é dia fechado`,
    );
    if (appointment.day === AGORA.day) {
      assert.ok(
        appointment.start + appointment.minutes <= AGORA.at,
        "hoje só entra o que já terminou",
      );
    }
  }
});

test("o relatório do período semeado sai com linhas diferentes", () => {
  const db = semeado();
  // O mês, e não a semana: a barbearia fecha segunda e domingo, e a terça de
  // hoje ainda está em aberto, então a semana corrente pode ser pouca coisa.
  const mes = report(db.comandas, monthRange(AGORA.day));
  assert.ok(mes.faturado > 0);
  assert.ok(mes.atendimentos > 5);
  assert.ok(mes.faltas > 0, "sem falta nenhuma o relatório não mostra a coluna");
  assert.ok(mes.porServico.length > 1, "quatro cortes iguais não ensinam nada");
  assert.ok(mes.porPagamento.length > 1, "as formas de pagamento têm que variar");
});

test("semear duas vezes não empilha atendimento em cima de dia cheio", () => {
  const uma = semeado();
  const outra = write(uma, historico(SHOP, uma, AGORA));
  assert.equal(outra.agenda.length, uma.agenda.length);
  assert.equal(outra.comandas.length, uma.comandas.length);
});

test("o futuro ocupa horários que ainda vão acontecer", () => {
  const db = write(emptyDb(), futuro(SHOP, emptyDb(), AGORA));
  assert.ok(db.agenda.length > 0);
  assert.ok(
    db.agenda.every((a) => a.day > AGORA.day || a.start >= AGORA.at),
    "semear o futuro não pode marcar no passado",
  );
  assert.deepEqual(db.comandas, [], "o que não aconteceu não tem comanda");
});
