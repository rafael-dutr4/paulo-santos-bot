# Paulo Santos Bot Agent Guide

## Mission

A rules chatbot for a barbershop. It answers the repeated questions (preços, horários, endereço) and books the horário, in pt-br, through a numbered menu.

It serves two people through the same number. A client books, cancels and remarca; o barbeiro (whoever is in `SHOP.barbers`) reads the agenda, closes the comanda of an atendimento and asks for the relatório. The phone picks which state table runs, and the interpreter does not know there are two.

The first shell around the engine is a WhatsApp simulator: a static page with the two chats, one tab each, used to validate the flow before any WhatsApp API exists.

This project exists as much for the learning as for the product. Explain the mechanism when you build it, and prefer the approach that teaches more when two options cost about the same.

## Non-negotiable rules

- **No dependencies.** TypeScript is the only `devDependency` and there are no runtime dependencies. No framework, no bundler, no test framework, no date library. If something looks like it needs one, write the small version by hand.
- **The engine is pure.** `reply()` takes the clock and the agenda as data and returns the next session, the messages and the effects. No `Date.now()` and no `Math.random()` anywhere in `src/bot/`, `src/shop/` or `src/text/`.
- **The engine describes changes, it does not perform them.** Booking, cancelling and closing a comanda come out as `Effect[]` and the shell applies them. Dentro do turno, o motor avança a própria foto do mundo pela função `advance` da tabela, para um estado que escreve e mostra no mesmo turno não mostrar o mundo de antes. This is what lets the simulator keep the agenda in `localStorage` and a future adapter keep it in a database, over identical code.
- **The engine names a message, it does not word one.** It returns a `Message` (a key and its params). `src/text/ptbr.ts` is the only file that holds a sentence a client reads. Tests assert on keys.
- **O português vive em `src/text/`, dos dois lados.** `ptbr.ts` escreve e `horas.ts` lê. Um leitor devolve todas as leituras possíveis, em ordem de probabilidade, e quem escolhe é o fluxo, que sabe o que está livre. Nenhum arquivo de `src/text/` sabe o que é barbearia.
- **Toda lista numerada termina em "voltar".** A última linha sai de `numbered()` e é atendida por uma regra global, uma por tabela. As ofertas pertencem ao estado que as fez: entrar em qualquer estado apaga a lista anterior.
- **The flow is data.** The state tables in `src/bot/flow.ts` (o cliente) and `src/bot/barbeiro.ts` (o barbeiro) are objects, and `engine.ts` is an interpreter that knows nothing about barbershops. Anything specific to the barbershop goes in a table or in `src/shop/`, never in the interpreter. A third conversation would be a third file, not an `if`.
- **The shell holds the world, behind a port.** `src/store.ts` says what a store has to do (four operations, one of them pure) and the simulator implements it over `localStorage`. A database later is another implementation of the same four, and nothing above it changes.
- **O que o barbeiro edita é dado do banco, não do código.** Preço, tempo, serviço, produto, horário de funcionamento e dia fechado mudam pela conversa, então moram no `Db` como `Settings` e a casca monta o `Shop` de cada turno com `withSettings(SHOP, db.settings)`. `SHOP` é com o que a barbearia abre as portas, e o que não muda por conversa (endereço, telefone, formas de pagamento, o tamanho da grade) continua sendo código.
- **Time is wall clock time, not `Date`.** A day is `"2026-08-11"` and an hour is minutes since midnight. `Date` appears once, in `src/sim/clock.ts`, to read the browser clock.
- **The DOM lives in `src/sim/` and nowhere else.** Everything above it runs in Node with no shims.

## Repository map

```
src/store.ts    the port: what a store has to do, and write(), the pure part
src/bot/      the interpreter, pure
  session.ts    Session, the drafts (booking and comanda), the offered choices
  message.ts    Message
  match.ts      the matchers: option, choice, keyword, yesno, money, someDay
  flow.ts       the client state table, and reply() choosing the table
  barbeiro.ts   the barber state table: agenda, comanda, relatório
  engine.ts     run(), the interpreter loop
src/shop/     the domain, pure
  shop.ts       endereço, telefone, e o estado inicial do que se edita
  time.ts       Day, Minutes, Moment, days-from-civil arithmetic
  slots.ts      freeSlots(), the interval subtraction
  agenda.ts     Appointment, Effect, and applying an Effect to an agenda
  comanda.ts    Comanda, os itens (serviço ou produto), e as pendências
  report.ts     report(), e os intervalos: dia, semana, mês
src/text/     a língua do projeto: um lado escreve, o outro lê
  ptbr.ts       every sentence the client and the barber read
  say.ts        Message -> string
  horas.ts      lê a hora em português ("duas e meia" -> 14:30 ou 02:30)
  datas.ts      lê o dia ("ontem", "10/08"), na ordem mais perto de hoje
  dinheiro.ts   lê o valor ("45", "R$ 45,50") em centavos
  duracao.ts    lê a duração ("1h30", "meia hora") em minutos
src/sim/      the shell: the only place that touches the DOM
  main.ts       wiring
  conversa.ts   um turno: mensagem -> reply -> guardar, aplicar, responder
  chat.ts       the WhatsApp looking conversation
  store.ts      o Store da porta, em localStorage
  seed.ts       encher o banco: o futuro do cliente e o histórico do barbeiro
  clock.ts      the injected now, and the time control
  panel.ts      the dev panel
  tabs.ts       as três telas: conversa, estado, barbeiro
  viewport.ts   o encaixe da tela quando o teclado do celular abre
```

A aba "Barbeiro" é a segunda conversa, e não uma tela de administração: o
barbeiro fala com o mesmo bot, pelo mesmo número, e o que muda é o telefone de
onde a mensagem chega. As duas leem o mesmo `Store`, então um horário marcado
numa aparece na agenda da outra sem ligação nenhuma entre as telas.

A página é uma tela só, do tamanho da janela, e nada nela rola além do miolo da
vista aberta. Quem manda na altura é `viewport.ts`, pelo `visualViewport`: com o
teclado aberto o `#app` encolhe, então o campo de mensagem encosta no teclado em
vez de ficar embaixo dele.

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

`tests/flow.test.ts` walks both state tables and fails when a transition names a state that does not exist, when a state is unreachable from the start, when a non terminal state has no way out, or when a message key has no pt-br wording. A conversation new to the project is a new line in its `FLOWS` list.

A fixture picks the table by `# phone`: a number in `SHOP.barbers` runs the barber's. `=` asserts the agenda at the end and `$` asserts the comandas.

## Commits

Conventional Commits, scoped to the module: `feat(engine):`, `fix(slots):`, `docs:`, `test(flow):`, `build:`, `refactor:`, `chore:`.

Subject in the imperative. **Never add a `Co-Authored-By` trailer or a generated-with footer.**

One commit per coherent step, not one per milestone.

**Every commit that adds behavior explains it in the body, with a worked example.** Indent examples by four spaces so they survive `git log` without a code fence.

##### References

- `README.md`: what the project is and how to run it.
- `docs/FLUXO.md`: the flow, state by state.
