/**
 * A conversa na tela.
 *
 * Só isto: pintar balões. O simulador inteiro é uma casca em volta do motor, e
 * esta é a parte que se parece com o WhatsApp.
 */

export type Bubble = {
  from: "cliente" | "bot";
  text: string;
  /** A hora do relógio simulado, não a do navegador. */
  at: string;
};

export function paint(list: HTMLElement, bubbles: Bubble[]): void {
  list.replaceChildren();
  for (const bubble of bubbles) list.append(element(bubble));
  scroll(list);
}

export function append(list: HTMLElement, bubble: Bubble): void {
  list.append(element(bubble));
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

function element(bubble: Bubble): HTMLElement {
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
  return node;
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
