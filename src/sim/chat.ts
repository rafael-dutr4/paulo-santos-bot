/**
 * A conversa na tela.
 *
 * Só isto: pintar balões. O simulador inteiro é uma casca em volta do motor, e
 * esta é a parte que se parece com o WhatsApp.
 *
 * Um balão do bot pode trazer uma `Lista`, e aí ganha embaixo o botão que o
 * WhatsApp põe numa mensagem de `/send-option-list`: ele abre uma folha, e
 * tocar numa linha manda o número dela como se alguém o tivesse digitado. É a
 * mesma mensagem por dois caminhos, que é a razão do botão existir aqui ,
 * quando a lista de verdade falhar em produção, o texto embaixo continua.
 */

import type { Lista } from "./lista.ts";

export type Bubble = {
  from: "cliente" | "bot";
  text: string;
  /** A hora do relógio simulado, não a do navegador. */
  at: string;
  /** A lista que este balão abre, quando o texto oferece uma. */
  lista?: Lista;
};

/** Quem manda o número da linha tocada, como se fosse digitado. */
export type Pick = (n: number) => void;

export function paint(list: HTMLElement, bubbles: Bubble[], pick: Pick): void {
  list.replaceChildren();
  for (const bubble of bubbles) list.append(element(bubble, pick));
  scroll(list);
}

export function append(list: HTMLElement, bubble: Bubble, pick: Pick): void {
  list.append(element(bubble, pick));
  scroll(list);
}

/** Mostra "digitando..." e devolve a função que tira. */
export function typing(list: HTMLElement): () => void {
  const node = document.createElement("div");
  node.className = "bubble bot typing";
  node.append(dot(), dot(), dot());
  list.append(node);
  scroll(list);
  return () => node.remove();
}

function element(bubble: Bubble, pick: Pick): HTMLElement {
  const node = document.createElement("div");
  node.className = `bubble ${bubble.from}`;

  const text = document.createElement("span");
  text.className = "text";
  // textContent e não innerHTML: o que o cliente digita não vira marcação.
  text.textContent = bubble.text;

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = bubble.at;
  // Os dois tiques azuis só existem do lado de quem mandou.
  if (bubble.from === "cliente") meta.append(ticks());

  node.append(text, meta);
  if (bubble.lista) node.append(botao(bubble.lista, pick));
  return node;
}

/** O botão que abre a lista, colado embaixo do balão como no aplicativo. */
function botao(lista: Lista, pick: Pick): HTMLElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "lista";
  node.textContent = "☰ Ver opções";
  node.addEventListener("click", () => folha(node, lista, pick));
  return node;
}

/**
 * A folha que sobe de baixo com as linhas da lista.
 *
 * Ela cobre a vista inteira, cabeçalho e campo de mensagem juntos, que é como o
 * WhatsApp abre a dele. Tocar numa linha fecha e manda o número: daí em diante
 * o turno é igualzinho ao de quem digitou.
 */
function folha(onde: HTMLElement, lista: Lista, pick: Pick): void {
  const fundo = document.createElement("div");
  fundo.className = "folha-fundo";

  const painel = document.createElement("div");
  painel.className = "folha";
  painel.setAttribute("role", "dialog");
  painel.setAttribute("aria-modal", "true");
  painel.setAttribute("aria-label", lista.titulo === "" ? "Opções" : lista.titulo);

  if (lista.titulo !== "") {
    const titulo = document.createElement("p");
    titulo.className = "folha-titulo";
    titulo.textContent = lista.titulo;
    painel.append(titulo);
  }

  const fechar = (): void => {
    fundo.remove();
    document.removeEventListener("keydown", tecla);
  };
  const tecla = (event: KeyboardEvent): void => {
    if (event.key === "Escape") fechar();
  };

  for (const opcao of lista.opcoes) {
    const linha = document.createElement("button");
    linha.type = "button";
    linha.className = "folha-opcao";
    linha.textContent = opcao.label;
    linha.addEventListener("click", () => {
      fechar();
      pick(opcao.n);
    });
    painel.append(linha);
  }

  // Só o fundo fecha; um toque na folha não. `document` e não a folha para o
  // Escape, que é a tecla e não o foco.
  fundo.addEventListener("click", (event) => {
    if (event.target === fundo) fechar();
  });
  document.addEventListener("keydown", tecla);

  fundo.append(painel);
  // Dentro da vista, e não no `body`: numa tela grande a página é um telefone
  // no meio do monitor, e a folha tem que caber no telefone.
  (onde.closest(".vista") ?? document.body).append(fundo);
  painel.querySelector<HTMLButtonElement>(".folha-opcao")?.focus();
}

/** Os dois tiques de "lido", desenhados à mão para não pesar uma imagem. */
function ticks(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "tique");
  svg.setAttribute("viewBox", "0 0 20 14");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "m7.6 12.2-4.5-4.5 1.3-1.3 3.2 3.2 7-7L15.9 4zm5.5 0-1.3-1.3 1.3-1.3 1.3 1.3zm5.6-8.2-7 7-1.3-1.3 7-7z",
  );
  svg.append(path);
  return svg;
}

function dot(): HTMLElement {
  const node = document.createElement("i");
  node.className = "dot";
  return node;
}

export function scroll(list: HTMLElement): void {
  list.scrollTop = list.scrollHeight;
}
