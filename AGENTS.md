# Paulo Santos Bot Agent Guide

## Mission

A rules chatbot for a barbershop. It answers the repeated questions (preços, horários, endereço) and books the horário, in pt-br, through a numbered menu.

The first shell around the engine is a WhatsApp simulator: a static page with a single chat, used to validate the flow before any WhatsApp API exists.

This project exists as much for the learning as for the product. Explain the mechanism when you build it, and prefer the approach that teaches more when two options cost about the same.

## Non-negotiable rules

- **No dependencies.** TypeScript is the only `devDependency` and there are no runtime dependencies. No framework, no bundler, no test framework, no date library. If something looks like it needs one, write the small version by hand.
- **The engine is pure.** `reply()` takes the clock and the agenda as data and returns the next session, the messages and the effects. No `Date.now()` and no `Math.random()` anywhere in `src/bot/`, `src/shop/` or `src/text/`.
- **The engine describes changes, it does not perform them.** Booking and cancelling come out as `Effect[]` and the shell applies them. This is what lets the simulator keep the agenda in `localStorage` and a future adapter keep it in a database, over identical code.
- **The engine names a message, it does not word one.** It returns a `Message` (a key and its params). `src/text/ptbr.ts` is the only file that holds a sentence a client reads. Tests assert on keys.
- **O português vive em `src/text/`, dos dois lados.** `ptbr.ts` escreve e `horas.ts` lê. Um leitor devolve todas as leituras possíveis, em ordem de probabilidade, e quem escolhe é o fluxo, que sabe o que está livre. Nenhum arquivo de `src/text/` sabe o que é barbearia.
- **The flow is data.** The state table in `src/bot/flow.ts` is an object, and `engine.ts` is an interpreter that knows nothing about barbershops. Anything specific to the barbershop goes in the table or in `src/shop/`, never in the interpreter.
- **Time is wall clock time, not `Date`.** A day is `"2026-08-11"` and an hour is minutes since midnight. `Date` appears once, in `src/sim/clock.ts`, to read the browser clock.
- **The DOM lives in `src/sim/` and nowhere else.** Everything above it runs in Node with no shims.

## Repository map

```
src/bot/      the interpreter, pure
  session.ts    Session, the booking draft, the offered choices
  message.ts    Message
  match.ts      the matchers: option, choice, keyword, yesno, freeText
  flow.ts       the state table (the flow itself)
  engine.ts     reply(), the interpreter loop
  effects.ts    Effect types
src/shop/     the domain, pure
  shop.ts       services, prices, duration, opening hours, address
  time.ts       Day, Minutes, Moment, days-from-civil arithmetic
  slots.ts      freeSlots(), the interval subtraction
  agenda.ts     Appointment, and applying an Effect to an agenda
src/text/     a língua do projeto: um lado escreve, o outro lê
  ptbr.ts       every sentence the client reads
  say.ts        Message -> string
  horas.ts      lê a hora em português ("duas e meia" -> 14:30 ou 02:30)
src/sim/      the only place that touches the DOM
  main.ts       wiring
  chat.ts       the WhatsApp looking conversation
  store.ts      session and agenda in localStorage
  clock.ts      the injected now, and the time control
  panel.ts      the dev panel
```

## Toolchain

Node runs the TypeScript sources directly by stripping types, so tests need no build step. `tsc` compiles to `dist/` for the browser and rewrites the `.ts` import extensions to `.js`.

Relative imports in `src/` must be written with the `.ts` extension (`import { reply } from "./engine.ts"`). This is what lets the same file run under Node and compile for the browser.

```bash
npm run check    # tsc --noEmit
npm test         # node --test tests/*.test.ts
npm run build    # tsc -> dist/
npm run serve    # http://localhost:8000
```

## Tests

One test file per module in `tests/`, using `node:test` and `node:assert`.

`tests/conversas/*.txt` holds conversation fixtures, and they are the tests that matter. A fixture is a transcript: `>` is a client message, `<` is a message key the bot must emit, in order.

```text
# now: 2026-08-10 10:00
> oi
< saudacao
< menu
```

`tests/flow.test.ts` walks the state table and fails when a transition names a state that does not exist, when a state is unreachable from `menu`, when a non terminal state has no way out, or when a message key has no pt-br wording.

## Commits

Conventional Commits, scoped to the module: `feat(engine):`, `fix(slots):`, `docs:`, `test(flow):`, `build:`, `refactor:`, `chore:`.

Subject in the imperative. **Never add a `Co-Authored-By` trailer or a generated-with footer.**

One commit per coherent step, not one per milestone.

**Every commit that adds behavior explains it in the body, with a worked example.** Indent examples by four spaces so they survive `git log` without a code fence.

##### References

- `README.md`: what the project is and how to run it.
- `docs/FLUXO.md`: the flow, state by state.
