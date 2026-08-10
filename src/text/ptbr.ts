/**
 * Tudo que o cliente lê.
 *
 * Este é o único arquivo do projeto com uma frase dentro. O motor devolve uma
 * chave e os dados, e aqui a chave vira português. Por isso mexer numa vírgula
 * não quebra teste nenhum, e por isso o dia chega como `2026-08-11` e vira
 * "terça-feira, 11/08" só aqui.
 *
 * As três telas de informação (preços, horários, endereço) leem `SHOP` direto.
 * Elas não têm menu numerado, então não há numeração para combinar com o que o
 * motor ofereceu, e ler o dado aqui evita passar a tabela inteira como
 * parâmetro só para escrevê-la de volta.
 */

import type { MessageKey } from "../bot/message.ts";
import type { Interval } from "../shop/shop.ts";
import { SHOP } from "../shop/shop.ts";
import { hhmm, isDay, parts, weekday } from "../shop/time.ts";
import type { Day, Minutes, Weekday } from "../shop/time.ts";

export type Words = Record<string, string | number>;
export type Template = (words: Words) => string;

/**
 * O nome de cada período.
 *
 * As bordas ficam em `shop.ts`, porque o fluxo corta os horários por elas. Aqui
 * fica só como se chama cada pedaço do dia.
 */
const PERIODOS: Record<string, { nome: string; emoji: string }> = {
  manha: { nome: "Manhã", emoji: "🌅" },
  tarde: { nome: "Tarde", emoji: "☀️" },
};

const periodo = (id: string): { nome: string; emoji: string } =>
  PERIODOS[id] ?? { nome: id, emoji: "" };

const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const str = (words: Words, key: string): string => String(words[key] ?? "");
const num = (words: Words, key: string): number => Number(words[key] ?? 0);
/** 4500 vira `R$ 45,00`. Dinheiro é inteiro em centavos até a hora de escrever. */
export function brl(centavos: number): string {
  return `R$ ${Math.floor(centavos / 100)},${String(centavos % 100).padStart(2, "0")}`;
}

/**
 * `2026-08-11` vira `terça-feira, 11/08`.
 *
 * Se não for uma data, devolve o que chegou. Escrever o dado cru é feio, mas um
 * bot que estoura no meio de uma frase deixa o cliente sem resposta nenhuma, e
 * uma sessão velha guardada no navegador é motivo suficiente para isso
 * acontecer um dia.
 */
export function dia(day: Day): string {
  if (!isDay(day)) return day;
  const { month, day: d } = parts(day);
  return `${DIAS[weekday(day)]}, ${String(d).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

export function hora(at: Minutes): string {
  return hhmm(at);
}

function intervalos(list: Interval[]): string {
  return list.map((i) => `${hhmm(i.start)} às ${hhmm(i.end)}`).join(" e ");
}

/**
 * A tabela de horários, com os dias iguais agrupados.
 *
 * Escrever seis linhas iguais é o que faz o cliente parar de ler. Os dias são
 * percorridos de segunda a domingo e um dia entra na mesma faixa do anterior
 * quando o horário é idêntico, então mudar o sábado no `shop.ts` quebra a faixa
 * sozinho.
 */
function tabelaDeHorarios(): string {
  const ordem: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  const abertos = ordem.filter((d) => SHOP.hours[d].length > 0);
  const fechados = ordem.filter((d) => SHOP.hours[d].length === 0);

  const faixas: { de: Weekday; ate: Weekday; horario: string }[] = [];
  for (const d of abertos) {
    const horario = intervalos(SHOP.hours[d]);
    const ultima = faixas.at(-1);
    if (ultima && ultima.horario === horario && ordem.indexOf(d) === ordem.indexOf(ultima.ate) + 1) {
      ultima.ate = d;
    } else {
      faixas.push({ de: d, ate: d, horario });
    }
  }

  const linhas = faixas.map(
    (f) => `${f.de === f.ate ? DIAS[f.de] : `${DIAS[f.de]} a ${DIAS[f.ate]}`}: ${f.horario}`,
  );
  if (fechados.length > 0) {
    linhas.push(`Fechado: ${lista(fechados.map((d) => DIAS[d] ?? ""))}`);
  }
  return linhas.join("\n");
}

function lista(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

export const PTBR: Record<MessageKey, Template> = {
  saudacao: () =>
    `Opa! Aqui é o assistente da ${SHOP.name} 💈\nPosso te ajudar com agendamento e informações.`,

  menu: () =>
    [
      "O que você quer fazer?",
      "",
      "1 - Agendar um horário",
      "2 - Ver meus agendamentos",
      "3 - Preços",
      "4 - Horário de funcionamento",
      "5 - Onde ficamos",
      `6 - Falar com o ${SHOP.barber}`,
      "",
      "É só responder com o número.",
    ].join("\n"),

  nao_entendi: () => "Não entendi 🤔 Responde com o número da opção, por favor.",

  despedida: () => `Valeu! Qualquer coisa é só chamar. Até mais ✂️`,

  humano: () =>
    `Beleza, vou chamar o ${SHOP.barber}. Ele responde aqui assim que puder 👍\nSe for urgente, liga em ${SHOP.phone}.`,

  precos: () =>
    [
      "Nossa tabela:",
      "",
      ...SHOP.services.map((s) => `${s.name}: ${brl(s.price)} (${s.minutes} min)`),
      "",
      "Aceitamos dinheiro, pix e cartão.",
    ].join("\n"),

  horarios: () => ["🕐 Horário de funcionamento:", "", tabelaDeHorarios()].join("\n"),

  endereco: () =>
    [`📍 Estamos na ${SHOP.address}.`, "", `No mapa: ${SHOP.maps}`].join("\n"),

  escolher_servico: (w) => ["Qual serviço você quer?", "", str(w, "itens")].join("\n"),
  item_servico: (w) =>
    `${num(w, "n")} - ${str(w, "nome")} (${num(w, "minutos")} min, ${brl(num(w, "preco"))})`,

  escolher_dia: (w) =>
    [`${str(w, "servico")}, boa escolha. Para quando?`, "", str(w, "itens")].join("\n"),
  item_dia: (w) => `${num(w, "n")} - ${dia(str(w, "dia"))}`,

  escolher_periodo: (w) =>
    [`Para ${dia(str(w, "dia"))}. Qual período?`, "", str(w, "itens")].join("\n"),
  item_periodo: (w) => {
    const { nome, emoji } = periodo(str(w, "periodo"));
    return `${num(w, "n")} - ${emoji} ${nome} (${hora(num(w, "de"))} às ${hora(num(w, "ate"))})`;
  },

  escolher_hora: (w) =>
    [
      `Horários livres na ${periodo(str(w, "periodo")).nome.toLowerCase()} de ${dia(
        str(w, "dia"),
      )}:`,
      "",
      str(w, "itens"),
      "",
      "Responde com o número ou com o horário.",
    ].join("\n"),
  item_hora: (w) => `${num(w, "n")} - ${hora(num(w, "hora"))}`,
  item_outro_periodo: (w) => `${num(w, "n")} - Ver outro período`,

  hora_indisponivel: () => "Esse horário não está livre 😕 Escolhe um destes:",

  sem_horarios: () =>
    "Poxa, não tenho horário livre para esse serviço nos próximos dias 😕 Manda uma mensagem que a gente dá um jeito.",

  pedir_nome: () => "Qual é o seu nome?",

  resumo: (w) =>
    [
      "Confere para mim:",
      "",
      `Serviço: ${str(w, "servico")}`,
      `Quando: ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}`,
      `Valor: ${brl(num(w, "preco"))}`,
      `Nome: ${str(w, "nome")}`,
    ].join("\n"),

  resumo_remarcacao: (w) =>
    [
      "Vou remarcar para:",
      "",
      `Serviço: ${str(w, "servico")}`,
      `Quando: ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}`,
      `Valor: ${brl(num(w, "preco"))}`,
      `Nome: ${str(w, "nome")}`,
    ].join("\n"),

  confirmar: () => "Posso confirmar? (sim / não)",

  slot_ocupado: () =>
    "Esse horário acabou de ser preenchido 😕 Dá uma olhada nos que ainda estão livres:",

  agendado: (w) =>
    [
      `Agendado, ${str(w, "nome")}! ✂️`,
      "",
      `${str(w, "servico")} em ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}.`,
      `Te espero na ${str(w, "endereco")}.`,
      "",
      "Se precisar cancelar, é só me chamar.",
    ].join("\n"),

  remarcado: (w) =>
    [
      `Remarcado, ${str(w, "nome")}! ✂️`,
      "",
      `${str(w, "servico")} agora é em ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}.`,
      `Te espero na ${str(w, "endereco")}.`,
    ].join("\n"),

  nao_agendado: () => "Tudo bem, não marquei nada.",

  meus_agendamentos: (w) => ["Seus horários marcados:", "", str(w, "itens")].join("\n"),
  item_agendamento: (w) =>
    `${num(w, "n")} - ${str(w, "servico")}, ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}`,

  sem_agendamentos: () => "Você não tem nenhum horário marcado por aqui.",

  o_que_fazer: (w) =>
    [
      `${str(w, "servico")} em ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}.`,
      "",
      "1 - Cancelar",
      "2 - Remarcar",
      "3 - Voltar",
    ].join("\n"),

  confirmar_cancelamento: (w) =>
    [
      `Quer mesmo cancelar ${str(w, "servico")} em ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}?`,
      "",
      "(sim / não)",
    ].join("\n"),

  cancelado: () => "Cancelado. Quando quiser marcar de novo, é só chamar 👍",
  cancelamento_abortado: () => "Beleza, seu horário continua marcado.",
};
