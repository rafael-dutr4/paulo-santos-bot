/**
 * O único lugar do projeto que fala com o relógio.
 *
 * O motor recebe o `Moment` pronto, então tudo abaixo daqui é determinístico e
 * testável. É também o único lugar que sabe que existe fuso horário: a hora do
 * navegador é convertida para a hora de parede de São Paulo aqui e nunca mais.
 */

import type { Moment } from "../shop/time.ts";
import { isDay, parseHhmm } from "../shop/time.ts";

const ZONE = "America/Sao_Paulo";

/**
 * `sv-SE` formata data e hora quase em ISO (`2026-08-10 10:43`), então
 * converter de fuso vira um `split`. É um truque, mas é o truque que evita
 * escrever aritmética de fuso na mão.
 */
export function browserNow(): Moment {
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  const [day, hour] = formatted.split(" ");
  return { day: day ?? "2026-01-01", at: parseHhmm(hour ?? "09:00") ?? 9 * 60 };
}

/** O que o painel escreveu nos campos, quando dá para ler. */
export function momentFrom(day: string, hour: string): Moment | null {
  const at = parseHhmm(hour);
  if (!isDay(day) || at === null) return null;
  return { day, at };
}
