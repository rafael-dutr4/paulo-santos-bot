/**
 * As telas do simulador, uma de cada vez.
 *
 * Não há roteador nem framework: uma aba é um `<button role="tab">` que aponta
 * para a sua vista por `aria-controls`, e trocar de aba é mexer em
 * `aria-selected` e no `hidden` da vista. Os atributos de acessibilidade são
 * também o estado, não existe uma segunda cópia de "qual aba está aberta"
 * para sair do lugar.
 */

export type Tabs = {
  /** Qual vista está aberta, pelo id do `<button>`. */
  current: () => string;
  select: (tabId: string) => void;
};

export function tabs(bar: HTMLElement, onSelect: (tabId: string) => void): Tabs {
  const buttons = [...bar.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const viewOf = (tab: HTMLButtonElement) =>
    document.getElementById(tab.getAttribute("aria-controls") ?? "");

  const select = (tabId: string): void => {
    for (const tab of buttons) {
      const chosen = tab.id === tabId;
      tab.setAttribute("aria-selected", String(chosen));
      // Só a aba aberta recebe o Tab do teclado; entre as abas anda-se com as
      // setas, que é o que um `tablist` promete a um leitor de tela.
      tab.tabIndex = chosen ? 0 : -1;
      viewOf(tab)?.toggleAttribute("hidden", !chosen);
    }
    onSelect(tabId);
  };

  for (const [i, tab] of buttons.entries()) {
    tab.addEventListener("click", () => select(tab.id));
    tab.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = buttons[(i + step + buttons.length) % buttons.length];
      if (!next) return;
      select(next.id);
      next.focus();
    });
  }

  return {
    current: () => buttons.find((tab) => tab.getAttribute("aria-selected") === "true")?.id ?? "",
    select,
  };
}
