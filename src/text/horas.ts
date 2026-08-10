/**
 * Ler a hora do jeito que o cliente escreve.
 *
 * `src/text/` é a língua do projeto: `ptbr.ts` escreve, este arquivo lê. Nenhum
 * dos dois sabe o que é barbearia, e por isso a leitura pode ser testada com
 * uma tabela de frases sem encostar no fluxo.
 *
 * A saída não é uma hora, é uma lista de candidatas em ordem de probabilidade.
 * "duas e meia" pode ser 02:30 ou 14:30 e o texto sozinho não decide: quem
 * decide é quem tem a lista de horários livres na mão (`src/bot/match.ts`),
 * escolhendo a primeira candidata que está de fato livre. Adivinhar aqui seria
 * chutar com menos informação.
 */

import type { Minutes } from "../shop/time.ts";

/** Palavras que valem uma hora. */
const HORAS: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17,
  dezoito: 18, dezenove: 19, vinte: 20,
};

/** Palavras que valem minutos. Os compostos vêm primeiro, senão "vinte e cinco" vira "20 e 5". */
const MINUTOS: [RegExp, string][] = [
  [/\bvinte e cinco\b/g, "25"],
  [/\btrinta e cinco\b/g, "35"],
  [/\bquarenta e cinco\b/g, "45"],
  [/\bcinquenta e cinco\b/g, "55"],
  [/\bum quarto\b/g, "15"],
  [/\bmeia\b/g, "30"],
  [/\btrinta\b/g, "30"],
  [/\bquarenta\b/g, "40"],
  [/\bcinquenta\b/g, "50"],
];

/**
 * As frases que viram hora, em ordem. A primeira que casa manda.
 *
 * A ordem importa: "quinze pras duas" tem que ser testada antes de "quinze",
 * senão o quinze vira a hora e o resto da frase é ignorado.
 */
type Formato = {
  padrao: RegExp;
  leia: (m: RegExpExecArray) => [number, number];
  /** Qual grupo trouxe a hora, para saber se ela veio com zero na frente. */
  cru?: number;
};

const FORMATOS: Formato[] = [
  // 14:30, 14h30, 9h
  { padrao: /(\d{1,2})\s*[:h]\s*(\d{2})/, leia: (m) => [+m[1]!, +m[2]!] },
  { padrao: /(\d{1,2})\s*h\b/, leia: (m) => [+m[1]!, 0] },
  // quinze pras duas, 20 para as 3
  {
    padrao: /(\d{1,2})\s*(?:pras?|para)\s*(\d{1,2})/,
    leia: (m) => [+m[2]! - 1, 60 - +m[1]!],
    cru: 2,
  },
  // duas e meia, 14 e 40
  { padrao: /(\d{1,2})\s*(?:horas?\s*)?e\s*(\d{1,2})\b/, leia: (m) => [+m[1]!, +m[2]!] },
  // duas horas, as 14, 9
  { padrao: /(\d{1,2})(?:\s*horas?)?\b/, leia: (m) => [+m[1]!, 0] },
];

/**
 * A frase é um horário, e não o número de uma opção?
 *
 * Numa lista numerada `9` é a nona linha, mas `9 e 30`, `9h`, `9 da noite` e
 * `quinze pras 9` são horas. O que separa os dois casos é ter mais do que o
 * número solto: minutos, separador, ou o período dito na frase.
 */
export function pareceHora(texto: string): boolean {
  const limpo = normalizar(texto);
  return (
    /\d\s*[:h]/.test(limpo) ||
    /\d\s*(?:horas?\s*)?e\s*\d/.test(limpo) ||
    /\d\s*(?:pras?|para)\s*\d/.test(limpo) ||
    /\bd[ae]\s*(manha|madrugada|tarde|noite)\b/.test(limpo)
  );
}

/**
 * As horas que a frase pode significar, da mais provável para a menos.
 *
 * Um relógio de doze horas cabe duas vezes no dia, então "duas" são 14:00 e
 * 02:00. Numa barbearia a tarde é sempre o palpite melhor, e por isso ela vem
 * na frente, mas as duas saem daqui: quem escolhe é quem sabe o que está livre.
 */
export function lerHora(texto: string): Minutes[] {
  const limpo = normalizar(texto);
  if (limpo === "") return [];

  for (const { padrao, leia, cru } of FORMATOS) {
    const encontrado = padrao.exec(limpo);
    if (!encontrado) continue;

    const [hora, minuto] = leia(encontrado);
    if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return [];

    const manha = hora * 60 + minuto;
    const tarde = (hora + 12) * 60 + minuto;

    if (/\bd[ae]\s*(manha|madrugada)\b/.test(limpo)) return [manha];
    if (/\bd[ae]\s*(tarde|noite)\b/.test(limpo)) return hora <= 11 ? [tarde] : [manha];
    if (hora === 0 || hora >= 12) return [manha];
    // Zero na frente é relógio de 24 horas: quem escreve "07:00" quer 07:00, e
    // quem quer as sete da noite escreve "7" ou "19:00".
    if (encontrado[cru ?? 1]!.startsWith("0")) return [manha];
    // Uma a onze: a barbearia abre de dia, então a tarde é o palpite melhor.
    return hora <= 7 ? [tarde, manha] : [manha, tarde];
  }
  return [];
}

/**
 * Tira o que não é hora e troca palavra por número.
 *
 * Depois desta função "às duas e meia da tarde" é "2 e 30 da tarde", e daí para
 * frente tudo é aritmética sobre dígitos.
 */
function normalizar(texto: string): string {
  let limpo = ` ${texto.toLowerCase()} `
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\b(as|a|pode ser|quero|marca|marcar|prefiro|de preferencia|entao|ai)\b/g, " ")
    // Antes de tudo, senão "meia noite" vira "30 noite" na troca dos minutos.
    .replace(/\bmeio\s*-?\s*dia\b/g, "12")
    .replace(/\bmeia\s*-?\s*noite\b/g, "0");

  for (const [padrao, valor] of MINUTOS) limpo = limpo.replace(padrao, valor);
  for (const [palavra, valor] of Object.entries(HORAS)) {
    limpo = limpo.replace(new RegExp(`\\b${palavra}\\b`, "g"), String(valor));
  }
  return limpo.replace(/\s+/g, " ").trim();
}
