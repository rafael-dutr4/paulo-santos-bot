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

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = bubble.at;

  node.append(text, time);
  return node;
}

function dot(): HTMLElement {
  const node = document.createElement("i");
  node.className = "dot";
  return node;
}

function scroll(list: HTMLElement): void {
  list.scrollTop = list.scrollHeight;
}
