/**
 * Ler um dia em português.
 *
 * Como `horas.ts`, é um leitor: devolve todas as leituras possíveis, em ordem
 * de probabilidade, e quem escolhe é o fluxo. Nada aqui sabe o que é barbearia
 * nem o que é um relatório.
 *
 * A ordem é a distância até hoje, do mais perto para o mais longe. `28/12` no
 * dia 5 de janeiro quase certamente é o dezembro que passou, e `10/08` no dia
 * 11 de agosto é ontem, a mesma regra acerta os dois, e nenhuma delas precisa
 * saber se a pergunta olhava para trás ou para a frente.
 */

import type { Day, Weekday } from "../shop/time.ts";
import { addDays, daysBetween, format, isDay, parts, weekday } from "../shop/time.ts";

/** As palavras que valem um dia inteiro sozinhas, em dias a partir de hoje. */
const RELATIVOS: Record<string, number> = {
  hoje: 0,
  ontem: -1,
  anteontem: -2,
  amanha: 1,
  "depois de amanha": 2,
};

const DATA = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/;

const SEMANA: Record<string, Weekday> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

/** O que marca a leitura como olhando para trás. */
const PASSADO = /\b(?:passad[ao]|ultim[ao])\b/;

/** Palavras que só enfeitam: "na quinta", "quinta que vem", "próxima quinta". */
const ENFEITE = /\b(?:de|da|na|no|a|o|dia|feira|essa|esta|proxim[ao]|que|vem)\b/g;

/**
 * O nome do dia da semana, para a frente por padrão.
 *
 * "Quinta" é a quinta que vem, porque quem fala assim está combinando alguma
 * coisa; "quinta passada" é a que ficou para trás. Quando hoje já é quinta, a
 * leitura de frente é hoje mesmo, o dia mais próximo que atende o nome.
 *
 * As duas leituras são devolvidas sempre, na ordem que a frase pede. É a mesma
 * regra do resto do módulo: quem escolhe é o fluxo.
 */
function lerSemana(text: string, hoje: Day): Day[] {
  const limpo = text.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const nome = Object.keys(SEMANA).find((dia) => new RegExp(`\\b${dia}\\b`).test(limpo));
  if (nome === undefined) return [];

  // Sobrou palavra que não é o nome do dia nem enfeite? Então isto não é um
  // pedido de dia, é uma frase que por acaso tem "sexta" dentro.
  const resto = limpo
    .replace(new RegExp(`\\b${nome}\\b`), " ")
    .replace(PASSADO, " ")
    .replace(ENFEITE, " ")
    .trim();
  if (resto !== "") return [];

  const adiante = (SEMANA[nome]! - weekday(hoje) + 7) % 7;
  const frente = addDays(hoje, adiante);
  const tras = addDays(frente, -7);
  return PASSADO.test(limpo) ? [tras, frente] : [frente, tras];
}

export function lerDia(text: string, hoje: Day): Day[] {
  const limpo = text.trim();

  const relativo = RELATIVOS[limpo];
  if (relativo !== undefined) return [addDays(hoje, relativo)];

  // O dia como o computador escreve, que é o que chega de um `<input type=date>`.
  if (isDay(limpo)) return [limpo];

  const daSemana = lerSemana(limpo, hoje);
  if (daSemana.length > 0) return daSemana;

  const match = DATA.exec(limpo);
  if (!match) return [];

  const day = Number(match[1]);
  const month = Number(match[2]);
  const anos =
    match[3] === undefined
      ? // Sem ano, os candidatos são o ano de hoje e os vizinhos: é o que faz
        // uma data de dezembro lida em janeiro cair no ano passado.
        [parts(hoje).year - 1, parts(hoje).year, parts(hoje).year + 1]
      : [Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3])];

  return anos
    .map((year) => format({ year, month, day }))
    .filter(isDay)
    .sort((a, b) => Math.abs(daysBetween(hoje, a)) - Math.abs(daysBetween(hoje, b)));
}
