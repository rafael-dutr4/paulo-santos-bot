/**
 * Ler um valor em português.
 *
 * O outro lado desta rua é `brl()` em `ptbr.ts`, que escreve `R$ 45,00`. Aqui
 * se lê o que o barbeiro digita com o cliente na cadeira e o celular na mão:
 * `45`, `45,50`, `R$ 45`, `r$45.50`, `45 reais`.
 *
 * Sai em centavos, inteiro, como todo dinheiro deste projeto. Um número sem
 * casas é reais: quem digita `45` quer quarenta e cinco reais, nunca quarenta e
 * cinco centavos.
 */

const VALOR = /^(?:r\$\s*)?(\d{1,6})(?:[.,](\d{1,2}))?(?:\s*reais?)?$/;

export function lerDinheiro(text: string): number | null {
  const match = VALOR.exec(text.trim());
  if (!match) return null;

  const reais = Number(match[1]);
  // `45,5` é quarenta e cinco e cinquenta, não quarenta e cinco e cinco.
  const centavos = match[2] === undefined ? 0 : Number(match[2].padEnd(2, "0"));
  return reais * 100 + centavos;
}
