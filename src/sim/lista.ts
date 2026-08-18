/**
 * A lista de opções, do jeito que o WhatsApp abre.
 *
 * O menu numerado é o contrato: o cliente sempre pode responder "3". Mas o
 * WhatsApp tem uma lista de verdade, a Z-API manda em `/send-option-list`, e
 * ela chega como um botão que abre uma folha de linhas. O cliente toca numa
 * linha e o webhook devolve `listResponseMessage.selectedRowId`.
 *
 * Se esse `id` for o próprio número da linha, tocar é digitar: o adaptador
 * entrega "3" a `reply()` e nenhum matcher de `match.ts` precisa saber que
 * existe uma lista. É por isso que este arquivo lê o texto já escrito em vez de
 * pedir uma estrutura nova ao motor, a lista não é informação nova, é a mesma
 * informação com outra casca em volta.
 *
 * O reconhecimento é uma linha `"N - rótulo"`, que é a forma de toda lista
 * numerada do `ptbr.ts`, dos dois lados da conversa. Duas coisas ficam de fora:
 *
 * - **A hora.** A grade de um dia livre passa de dez linhas, que é o teto de
 *   uma lista do WhatsApp, e os títulos de período que a arejam não são
 *   opções. Hora continua sendo texto, e quem lê responde o número ou "14:30".
 * - **O que não conta de 1 até o fim.** "0 - Sem pausa pra almoço" é uma saída
 *   solta numa pergunta de texto livre, não um menu.
 */

import type { Choice } from "../bot/session.ts";

export type Opcao = { n: number; label: string };

/** O que o botão abre: o título da pergunta e as linhas. */
export type Lista = { titulo: string; opcoes: Opcao[] };

/** Quantas linhas uma lista do WhatsApp abre. Acima disso, só texto. */
export const MAX_LINHAS = 10;

/** Uma lista precisa de mais de uma linha para valer o toque. */
const MIN_LINHAS = 2;

const LINHA = /^(\d+) - (.+)$/;

/**
 * A lista que este texto oferece, ou `null` quando ele é só texto.
 *
 * As ofertas do turno entram junto porque são elas que dizem que a pergunta é
 * de hora: o motor guarda `{ kind: "slot" }` para cada horário livre, e nenhum
 * outro estado guarda isso.
 */
export function lista(texto: string, choices: Choice[]): Lista | null {
  if (choices.some((choice) => choice.kind === "slot")) return null;

  const linhas = texto.split("\n");
  const opcoes: Opcao[] = [];
  for (const linha of linhas) {
    const lido = LINHA.exec(linha);
    if (!lido) continue;
    // A numeração corre de 1 até o fim, sem buraco. Uma linha numerada que não
    // continua a contagem é outra coisa, e desiste da lista inteira.
    if (Number(lido[1]) !== opcoes.length + 1) return null;
    opcoes.push({ n: opcoes.length + 1, label: lido[2]! });
  }

  if (opcoes.length < MIN_LINHAS || opcoes.length > MAX_LINHAS) return null;

  // O título da folha é a pergunta, e a pergunta é o que vem antes da primeira
  // linha numerada. O menu do barbeiro não tem uma (ele abre direto na lista),
  // e aí a folha sobe sem título, que é o que a Z-API faz com `title` vazio.
  const titulo = linhas.find((linha) => linha.trim() !== "" && !LINHA.test(linha)) ?? "";
  return { titulo, opcoes };
}
