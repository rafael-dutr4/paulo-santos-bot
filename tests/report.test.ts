import test from "node:test";
import assert from "node:assert/strict";

import type { Comanda } from "../src/shop/comanda.ts";
import type { PaymentId } from "../src/shop/shop.ts";
import { dayRange, monthRange, report, weekRange } from "../src/shop/report.ts";

let n = 0;

/** `["corte", 4500]` é serviço; `["refrigerante", 600, "produto"]` é produto. */
function feita(
  day: string,
  itens: [string, number, "produto"?][],
  payment: PaymentId,
): Comanda {
  const total = itens.reduce((sum, [, price]) => sum + price, 0);
  return {
    id: `c${++n}`,
    day,
    start: 9 * 60,
    phone: "5511922222222",
    clientName: "Zé",
    status: "feito",
    itens: itens.map(([id, price, kind]) => ({
      kind: kind ?? ("servico" as const),
      id,
      name: id,
      price,
    })),
    total,
    payment,
    closedAt: { day, at: 10 * 60 },
  };
}

function falta(day: string): Comanda {
  return {
    id: `c${++n}`,
    day,
    start: 9 * 60,
    phone: "5511933333333",
    clientName: "Marcos",
    status: "faltou",
    itens: [],
    total: 0,
    closedAt: { day, at: 10 * 60 },
  };
}

const COMANDAS = [
  feita("2026-08-10", [["corte", 4500]], "pix"),
  feita("2026-08-11", [["corte", 4000], ["pezinho", 2000], ["refrigerante", 600, "produto"]], "dinheiro"),
  feita("2026-08-11", [["barba", 3500]], "pix"),
  falta("2026-08-11"),
  feita("2026-08-20", [["corte", 4500]], "credito"),
];

test("o faturado é a soma das comandas feitas, e a falta não soma nada", () => {
  const semana = report(COMANDAS, weekRange("2026-08-11"));
  assert.equal(semana.atendimentos, 3);
  assert.equal(semana.faltas, 1);
  assert.equal(semana.faturado, 4500 + 6600 + 3500);
});

test("o serviço conta por linha da comanda, não por comanda", () => {
  const dia = report(COMANDAS, dayRange("2026-08-11"));
  assert.deepEqual(
    dia.porServico.map((l) => [l.id, l.quantidade, l.total]),
    [
      ["corte", 1, 4000],
      ["barba", 1, 3500],
      ["pezinho", 1, 2000],
    ],
  );
});

test("o produto tem a sua própria coluna, e o total é partido em dois", () => {
  const dia = report(COMANDAS, dayRange("2026-08-11"));
  assert.deepEqual(
    dia.porProduto.map((l) => [l.id, l.quantidade, l.total]),
    [["refrigerante", 1, 600]],
  );
  assert.equal(dia.emServicos, 4000 + 3500 + 2000);
  assert.equal(dia.emProdutos, 600);
  assert.equal(dia.faturado, dia.emServicos + dia.emProdutos);
});

test("o relatório escreve o nome que estava na comanda, não o do catálogo", () => {
  const antiga = feita("2026-08-11", [["refri_antigo", 500, "produto"]], "pix");
  const numeros = report([{ ...antiga, itens: [{ ...antiga.itens[0]!, name: "Tubaína" }] }], dayRange("2026-08-11"));
  assert.equal(numeros.porProduto[0]?.name, "Tubaína");
});

test("o pagamento conta por comanda, com o total dela", () => {
  const dia = report(COMANDAS, dayRange("2026-08-11"));
  assert.deepEqual(dia.porPagamento, [
    { payment: "dinheiro", quantidade: 1, total: 6600 },
    { payment: "pix", quantidade: 1, total: 3500 },
  ]);
});

test("um dia sem comanda nenhuma é um relatório vazio, não um erro", () => {
  const vazio = report(COMANDAS, dayRange("2026-08-13"));
  assert.equal(vazio.atendimentos, 0);
  assert.equal(vazio.faltas, 0);
  assert.deepEqual(vazio.porServico, []);
});

test("a semana vai de segunda a domingo", () => {
  // 2026-08-11 é uma terça.
  assert.deepEqual(weekRange("2026-08-11"), { from: "2026-08-10", to: "2026-08-16" });
  // A segunda pertence à sua própria semana, e o domingo à semana que abriu.
  assert.deepEqual(weekRange("2026-08-10"), { from: "2026-08-10", to: "2026-08-16" });
  assert.deepEqual(weekRange("2026-08-16"), { from: "2026-08-10", to: "2026-08-16" });
});

test("o mês vai do dia 1 ao último, inclusive em fevereiro bissexto", () => {
  assert.deepEqual(monthRange("2026-08-11"), { from: "2026-08-01", to: "2026-08-31" });
  assert.deepEqual(monthRange("2026-02-05"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthRange("2028-02-05"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(monthRange("2026-12-31"), { from: "2026-12-01", to: "2026-12-31" });
});
