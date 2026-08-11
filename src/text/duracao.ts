/**
 * Ler uma duração em português.
 *
 * Parece o leitor de horas e não é: `1h30` como hora do dia é uma e meia da
 * madrugada, e como duração é uma hora e meia de cadeira. O mesmo texto, dois
 * significados, e quem sabe qual dos dois está perguntando é o fluxo — por isso
 * são dois leitores e não um com uma opção.
 *
 * Sai em minutos, que é como toda duração deste projeto é contada.
 */

import type { Minutes } from "../shop/time.ts";

const SO_MINUTOS = /^(\d{1,3})\s*(?:min|minutos?|m)?$/;
const COM_HORA = /^(\d{1,2})\s*(?:h|hora|horas|:)\s*(\d{1,2})?\s*(?:min|minutos?|m)?$/;

/** Meia hora é meia hora, e ninguém digita 30 quando fala. */
const POR_EXTENSO: Record<string, Minutes> = {
  "meia hora": 30,
  "uma hora": 60,
  "uma hora e meia": 90,
  "duas horas": 120,
};

export function lerDuracao(text: string): Minutes | null {
  const limpo = text.trim();

  const extenso = POR_EXTENSO[limpo];
  if (extenso !== undefined) return extenso;

  const horas = COM_HORA.exec(limpo);
  if (horas) {
    const minutos = Number(horas[1]) * 60 + Number(horas[2] ?? 0);
    return minutos > 0 ? minutos : null;
  }

  const sozinho = SO_MINUTOS.exec(limpo);
  if (!sozinho) return null;
  const minutos = Number(sozinho[1]);
  return minutos > 0 ? minutos : null;
}
