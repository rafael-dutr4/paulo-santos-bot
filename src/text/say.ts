/**
 * Da chave para a frase.
 *
 * Um parâmetro pode ser outra mensagem, ou uma lista delas, e é assim que um
 * menu numerado é montado: o estado nomeia `escolher_hora` com uma lista de
 * `item_hora`, cada item vira uma linha e as linhas são juntadas. A resolução é
 * recursiva, então um item poderia conter outro item sem nada mudar aqui.
 */

import type { Message, Param, Params } from "../bot/message.ts";
import type { Words } from "./ptbr.ts";
import { PTBR } from "./ptbr.ts";

export function say(message: Message): string {
  return PTBR[message.key](resolve(message.params));
}

function resolve(params: Params | undefined): Words {
  const words: Words = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    words[key] = flatten(value);
  }
  return words;
}

function flatten(value: Param): string | number {
  if (Array.isArray(value)) return value.map(say).join("\n");
  if (typeof value === "object") return say(value);
  return value;
}
