/**
 * O simulador: a casca fina em volta do motor.
 *
 * A página tem duas conversas com o mesmo bot — a do cliente e a do barbeiro —
 * e um painel no meio para mexer no relógio e olhar o que o motor está
 * pensando. As duas conversas são o mesmo código de `conversa.ts` com telefones
 * diferentes, e o mesmo `Store` atrás: marcar um corte na primeira faz o
 * horário aparecer na agenda da segunda, sem nenhuma ligação entre as telas.
 */

import type { Effect } from "../shop/agenda.ts";
import type { Shop } from "../shop/shop.ts";
import { SHOP, withCatalog } from "../shop/shop.ts";
import type { Moment } from "../shop/time.ts";
import type { Db } from "../store.ts";
import type { Bubble } from "./chat.ts";
import { browserNow } from "./clock.ts";
import type { Conversa } from "./conversa.ts";
import { conversa } from "./conversa.ts";
import { readClock, setClock, showAgenda, showSession } from "./panel.ts";
import { futuro, historico } from "./seed.ts";
import type { Saved } from "./store.ts";
import { BARBER, PHONE, empty, load, save, store } from "./store.ts";
import { tabs } from "./tabs.ts";
import { fitToKeyboard } from "./viewport.ts";

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let saved: Saved = load();
const db = store(() => saved);

/** A conversa daquele telefone, criada na primeira vez que alguém escreve. */
function transcript(phone: string): Bubble[] {
  return (saved.transcripts[phone] ??= []);
}

function changed(): void {
  save(saved);
  showSession(db.session(PHONE), db.session(BARBER), readClock());
  showAgenda(saved.db);
}

function now(): Moment {
  return readClock();
}

/** As duas conversas, iguais em tudo menos no telefone. */
function wire(phone: string, ids: { chat: string; form: string; field: string }): Conversa {
  return conversa({
    phone,
    chat: el(ids.chat),
    form: el<HTMLFormElement>(ids.form),
    field: el<HTMLInputElement>(ids.field),
    store: db,
    now,
    transcript: () => transcript(phone),
    forget: () => {
      delete saved.sessions[phone];
    },
    changed,
  });
}

const cliente = wire(PHONE, { chat: "chat", form: "composer", field: "entrada" });
const barbeiro = wire(BARBER, {
  chat: "chat-barbeiro",
  form: "composer-barbeiro",
  field: "entrada-barbeiro",
});

/**
 * As duas semeaduras, aplicadas pelo mesmo caminho de uma conversa.
 *
 * Elas devolvem `Effect[]`, então passam pelo mesmo `write()` que um "sim" do
 * cliente: o banco semeado é um banco que uma conversa saberia produzir.
 */
function semear(quais: (shop: Shop, db: Db, now: Moment) => Effect[]): void {
  const atual = db.db();
  db.apply(quais(withCatalog(SHOP, atual.catalog), atual, readClock()));
  changed();
}

function repaint(): void {
  cliente.paint();
  barbeiro.paint();
  changed();
}

function start(): void {
  setClock(browserNow());
  repaint();

  const abas = tabs(el("abas"), (id) => {
    // Voltar para uma conversa depois de mexer no painel: o fim da lista é o
    // que interessa, e um `div` escondido não guarda o `scrollTop`.
    if (id === "aba-conversa") cliente.scroll();
    if (id === "aba-barbeiro") barbeiro.scroll();
  });
  // O teclado encolhe o `#app`, então o balão de baixo sai de vista se ninguém
  // rolar. Só as conversas se importam; o painel rola sozinho.
  fitToKeyboard(() => {
    if (abas.current() === "aba-conversa") cliente.scroll();
    if (abas.current() === "aba-barbeiro") barbeiro.scroll();
  });

  // Sem nada escrito o botão é um microfone, como no aplicativo.
  for (const [campo, botao] of [
    ["entrada", "enviar"],
    ["entrada-barbeiro", "enviar-barbeiro"],
  ]) {
    const field = el<HTMLInputElement>(campo!);
    field.addEventListener("input", () => {
      el(botao!).classList.toggle("escrevendo", field.value.trim() !== "");
    });
  }

  // A seta do cabeçalho não tem para onde voltar: cada tela é uma conversa só.
  // Ela leva ao painel, que é o que existe "atrás" desta tela.
  el("voltar").addEventListener("click", () => abas.select("aba-estado"));
  el("voltar-barbeiro").addEventListener("click", () => abas.select("aba-estado"));

  el("clock-now").addEventListener("click", () => {
    setClock(browserNow());
    changed();
  });
  for (const id of ["clock-day", "clock-time"]) {
    el(id).addEventListener("change", changed);
  }

  el("reset").addEventListener("click", () => cliente.reset());
  el("reset-barbeiro").addEventListener("click", () => barbeiro.reset());
  el("seed").addEventListener("click", () => semear(futuro));
  el("seed-historico").addEventListener("click", () => semear(historico));
  // Limpar é limpar a agenda e as comandas. O catálogo não é movimento, é a
  // barbearia: apagá-lo aqui deixaria o bot sem nada para oferecer.
  el("clear-agenda").addEventListener("click", () => {
    saved.db = { ...saved.db, agenda: [], comandas: [] };
    changed();
  });
  el("reset-tudo").addEventListener("click", () => {
    saved = empty();
    repaint();
  });
}

start();
