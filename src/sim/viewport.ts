/**
 * O teclado do celular, que é o único jeito de essa tela dar errado.
 *
 * Quando o teclado abre, o navegador não muda o tamanho da janela: ele muda o
 * *visual viewport*, o pedaço da janela que sobrou visível. Uma página com
 * `height: 100vh` continua com a altura antiga, o campo de mensagem fica
 * embaixo do teclado e o navegador rola o documento inteiro para compensar,
 * empurrando as abas para fora da tela.
 *
 * O conserto tem duas partes, e nenhuma delas é `scrollIntoView`:
 *
 *   altura   `visualViewport.height` é o que sobrou, e é a altura do `#app`
 *   desvio   `offsetTop` é o quanto o viewport visual desceu dentro da página
 *
 * Escrevemos os dois como variáveis CSS, e o layout se encaixa sozinho porque
 * `#app` é uma coluna flex: o chat encolhe e o campo continua na borda de
 * baixo, encostado no teclado. Sem `visualViewport` (navegador antigo), o
 * `100dvh` do CSS já é a resposta certa.
 */

/** Devolve a função que desfaz, para quem quiser parar de ouvir. */
export function fitToKeyboard(onResize: () => void): () => void {
  const view = window.visualViewport;
  if (!view) return () => {};

  const apply = (): void => {
    const style = document.documentElement.style;
    style.setProperty("--altura", `${view.height}px`);
    style.setProperty("--desvio", `${view.offsetTop}px`);
    onResize();
  };

  view.addEventListener("resize", apply);
  view.addEventListener("scroll", apply);
  apply();

  return () => {
    view.removeEventListener("resize", apply);
    view.removeEventListener("scroll", apply);
  };
}
