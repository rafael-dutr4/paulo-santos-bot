import test from "node:test";
import assert from "node:assert/strict";

import { FLOW } from "../src/bot/flow.ts";
import type { State } from "../src/bot/engine.ts";
import type { StateName } from "../src/bot/session.ts";

/**
 * The edges of the graph, read from the table.
 *
 * A `go` written as a string is an edge. A `go` written as a function cannot be
 * read, so the transition has to declare its possible targets in `exits`, and
 * the first test below is what makes that declaration mandatory.
 */
function edges(state: State): StateName[] {
  const out: StateName[] = [];
  for (const transition of state.on ?? []) {
    if (typeof transition.go === "string") out.push(transition.go);
    out.push(...(transition.exits ?? []));
  }
  if (state.goto) out.push(state.goto);
  out.push(...(state.exits ?? []));
  if (state.back) out.push(state.back);
  return out;
}

/** O que a regra global de "voltar" declara que alcança. */
function backTargets(): StateName[] {
  const voltar = FLOW.global.find((t) => typeof t.go === "function" && t.exits);
  return voltar?.exits ?? [];
}

test("a transition that decides where to go declares where it can go", () => {
  for (const [name, state] of Object.entries(FLOW.states)) {
    for (const [i, transition] of (state.on ?? []).entries()) {
      if (typeof transition.go === "function") {
        assert.ok(
          transition.exits && transition.exits.length > 0,
          `${name}: a transição ${i} decide o destino e não declarou exits`,
        );
      }
    }
  }
});

test("every state named by the table exists", () => {
  const known = new Set(Object.keys(FLOW.states));
  const named = [
    FLOW.start,
    FLOW.stuck,
    ...FLOW.global.flatMap((t) => (typeof t.go === "string" ? [t.go] : (t.exits ?? []))),
    ...Object.values(FLOW.states).flatMap(edges),
  ];
  for (const name of named) {
    assert.ok(known.has(name), `estado desconhecido: ${name}`);
  }
});

test("every state is reachable from the start", () => {
  const seen = new Set<StateName>();
  const queue: StateName[] = [
    FLOW.start,
    ...FLOW.global.flatMap((t) => (typeof t.go === "string" ? [t.go] : (t.exits ?? []))),
  ];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    queue.push(...edges(FLOW.states[name]!));
  }
  const unreachable = Object.keys(FLOW.states).filter((name) => !seen.has(name));
  assert.deepEqual(unreachable, [], "estados que ninguém alcança");
});

test("no state is a dead end", () => {
  for (const [name, state] of Object.entries(FLOW.states)) {
    const hasWayOut = (state.on ?? []).length > 0 || state.goto || (state.exits ?? []).length > 0;
    assert.ok(hasWayOut, `${name}: entra e não sai`);
  }
});

test("no goto walks in a circle", () => {
  for (const start of Object.keys(FLOW.states)) {
    const seen = new Set<StateName>();
    let current: StateName | undefined = start;
    while (current) {
      assert.ok(!seen.has(current), `ciclo de goto passando por ${current}`);
      seen.add(current);
      current = FLOW.states[current]!.goto;
    }
  }
});

test("every step back is a state, and one the voltar rule admits it reaches", () => {
  const declared = new Set(backTargets());
  assert.ok(declared.has("menu"), "sem back, voltar cai no menu, então menu tem que estar lá");
  for (const [name, state] of Object.entries(FLOW.states)) {
    if (!state.back) continue;
    assert.ok(FLOW.states[state.back], `${name}: volta para um estado que não existe`);
    assert.ok(declared.has(state.back), `${name}: volta para ${state.back}, fora dos exits`);
  }
});

test("a step back never walks forward", () => {
  // Voltar de escolher_hora tem que desfazer a escolha do dia, não do serviço:
  // um passo atrás que pula dois é a mesma perda que mandar tudo para o menu.
  assert.equal(FLOW.states["escolher_hora"]?.back, "escolher_dia");
  assert.equal(FLOW.states["escolher_dia"]?.back, "escolher_servico");
  assert.equal(FLOW.states["escolher_servico"]?.back, undefined);
});

test("the stuck state is where a lost client ends up", () => {
  assert.ok(FLOW.missLimit >= 2, "menos que isso desiste do cliente cedo demais");
  assert.ok(FLOW.states[FLOW.stuck], "o estado de saída tem que existir");
});
