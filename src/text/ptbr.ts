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

/** `2026-08-11` vira `11/08`, sem o dia da semana, para caber numa faixa. */
function curto(day: Day): string {
  if (!isDay(day)) return day;
  const { month, day: d } = parts(day);
  return `${String(d).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

/** Um intervalo de um dia é um dia; de vários, uma faixa. */
function periodoEscrito(de: Day, ate: Day): string {
  return de === ate ? dia(de) : `${curto(de)} a ${curto(ate)}`;
}

const FORMAS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
};

const forma = (id: string): string => FORMAS[id] ?? id;

/** 90 minutos vira `1h30`, e 30 vira `30 min`. */
function tempo(minutos: Minutes): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/** `540-720 840-1140` vira "09:00 às 12:00 e 14:00 às 19:00". */
function faixas(dado: string): string {
  return dado
    .split(" ")
    .filter((faixa) => faixa !== "")
    .map((faixa) => {
      const [de, ate] = faixa.split("-").map(Number);
      return `${hhmm(de ?? 0)} às ${hhmm(ate ?? 0)}`;
    })
    .join(" e ");
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

  /** A última linha de toda lista numerada, e a única saída que não é palavra. */
  item_voltar: (w) => `${num(w, "n")} - Voltar`,

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

  ja_tem_horario: (w) =>
    [
      "Você já tem horário marcado 👇",
      "",
      str(w, "itens"),
      "",
      "Quer marcar outro além desse? (sim / não)",
    ].join("\n"),
  item_marcado: (w) =>
    `· ${str(w, "servico")}, ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}`,

  escolher_servico: (w) => ["Qual serviço você quer?", "", str(w, "itens")].join("\n"),
  item_servico: (w) =>
    `${num(w, "n")} - ${str(w, "nome")} (${num(w, "minutos")} min, ${brl(num(w, "preco"))})`,

  escolher_dia: (w) => [`${str(w, "servico")}. Para quando?`, "", str(w, "itens")].join("\n"),
  item_dia: (w) => `${num(w, "n")} - ${dia(str(w, "dia"))}`,

  escolher_hora: (w) =>
    [
      `Horários livres em ${dia(str(w, "dia"))}:`,
      str(w, "itens"),
      "",
      "Responde com o número ou com o horário.",
    ].join("\n"),

  // O `\n` na frente é o que separa um período do outro. Os itens são juntados
  // por quebra de linha, então o título abre a linha em branco do bloco.
  cabecalho_periodo: (w) => {
    const { nome, emoji } = periodo(str(w, "periodo"));
    return `\n${emoji} ${nome}`;
  },
  item_hora: (w) => `${num(w, "n")} - ${hora(num(w, "hora"))}`,

  hora_indisponivel: () => "Esse horário não está livre 😕 Escolhe um destes:",

  aproximei: (w) =>
    `Não tenho ${hora(num(w, "pedido"))}, o mais perto livre é ${hora(num(w, "dado"))} 👇`,

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
      `${num(w, "voltar")} - Voltar`,
    ].join("\n"),

  confirmar_cancelamento: (w) =>
    [
      `Quer mesmo cancelar ${str(w, "servico")} em ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}?`,
      "",
      "(sim / não)",
    ].join("\n"),

  cancelado: () => "Cancelado. Quando quiser marcar de novo, é só chamar 👍",
  cancelamento_abortado: () => "Beleza, seu horário continua marcado.",

  // --- o barbeiro ---------------------------------------------------------
  //
  // O barbeiro lê no intervalo entre dois cortes, com o celular numa mão só.
  // Então aqui as frases são mais curtas que as do cliente, o número vem antes
  // do nome, e nada é explicado duas vezes.

  saudacao_barbeiro: () => `Oi, ${SHOP.barber} 💈`,

  menu_barbeiro: () =>
    [
      "1 - Agenda de hoje",
      "2 - Agenda de outro dia",
      "3 - Fechar comanda",
      "4 - Relatório",
      "5 - Serviços e produtos",
      "6 - Dias e horários",
    ].join("\n"),

  despedida_barbeiro: () => "Fechado. Bom trabalho 💈",

  agenda_do_dia: (w) => [`📋 ${dia(str(w, "dia"))}`, "", str(w, "itens")].join("\n"),

  /**
   * Uma linha da agenda, com a situação no fim.
   *
   * O símbolo carrega o que uma palavra carregaria, e o barbeiro corre a
   * coluna com o olho em vez de ler linha por linha: `✓` já fechou, `✗` faltou,
   * `•` ainda está aberto e vai aparecer na lista de comandas.
   */
  item_agenda: (w) => {
    const situacao = str(w, "situacao");
    const marca = situacao === "feito" ? "✓" : situacao === "faltou" ? "✗" : "•";
    const fim =
      situacao === "feito"
        ? ` (${brl(num(w, "total"))})`
        : situacao === "faltou"
          ? " (faltou)"
          : "";
    return `${marca} ${hora(num(w, "hora"))} ${str(w, "nome")} · ${str(w, "servico")}${fim}`;
  },

  agenda_vazia: (w) => `Nada marcado em ${dia(str(w, "dia"))}.`,

  pedir_dia: () =>
    ["Qual dia? (hoje, ontem, quinta, quinta passada, 10/08)", "", "Ou voltar."].join("\n"),

  comandas_pendentes: (w) => ["Comandas em aberto:", "", str(w, "itens")].join("\n"),
  item_pendente: (w) =>
    `${num(w, "n")} - ${dia(str(w, "dia"))} ${hora(num(w, "hora"))} · ${str(w, "nome")} · ${str(w, "servico")}`,

  nada_a_fechar: () => "Nenhuma comanda em aberto 👍",

  compareceu: (w) =>
    [
      `${str(w, "nome")} · ${str(w, "servico")} · ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}`,
      "",
      "O cliente veio? (sim / não)",
    ].join("\n"),

  comanda: (w) =>
    [
      `🧾 ${str(w, "nome")} · ${dia(str(w, "dia"))} às ${hora(num(w, "hora"))}`,
      "",
      str(w, "itens"),
      `Total: ${brl(num(w, "total"))}`,
      "",
      "1 - Acrescentar serviço",
      "2 - Acrescentar produto",
      "3 - Corrigir um valor",
      "4 - Ir para o pagamento",
      `${num(w, "voltar")} - Voltar`,
    ].join("\n"),

  item_comanda: (w) => `· ${str(w, "nome")} — ${brl(num(w, "valor"))}`,

  servico_extra: (w) => ["O que mais foi feito?", "", str(w, "itens")].join("\n"),
  produto_extra: (w) => ["O que o cliente levou?", "", str(w, "itens")].join("\n"),
  item_produto: (w) => `${num(w, "n")} - ${str(w, "nome")} (${brl(num(w, "preco"))})`,

  escolher_item: (w) => ["Qual valor?", "", str(w, "itens")].join("\n"),
  item_para_corrigir: (w) => `${num(w, "n")} - ${str(w, "nome")} — ${brl(num(w, "valor"))}`,

  pedir_valor: (w) =>
    [
      `${str(w, "nome")} está ${brl(num(w, "valor"))}. Quanto ficou?`,
      "",
      "Responde o valor (45, 45,50), tirar para remover, ou voltar.",
    ].join("\n"),

  escolher_pagamento: (w) =>
    [`Total: ${brl(num(w, "total"))}`, "", "Como pagou?", "", str(w, "itens")].join("\n"),
  item_pagamento: (w) => `${num(w, "n")} - ${forma(str(w, "forma"))}`,

  comanda_fechada: (w) =>
    `Fechada: ${str(w, "nome")}, ${brl(num(w, "total"))} ✅`,

  comanda_faltou: (w) => `Anotado: ${str(w, "nome")} não veio.`,

  // --- o catálogo ---------------------------------------------------------

  catalogo: (w) =>
    [
      "✂️ Serviços",
      str(w, "servicos"),
      "",
      "🧴 Produtos",
      str(w, "produtos"),
      "",
      `${num(w, "novo_servico")} - Novo serviço`,
      `${num(w, "novo_produto")} - Novo produto`,
      `${num(w, "voltar")} - Voltar`,
    ].join("\n"),

  linha_catalogo_servico: (w) =>
    `${num(w, "n")} - ${str(w, "nome")} · ${tempo(num(w, "minutos"))} · ${brl(num(w, "preco"))}`,
  linha_catalogo_produto: (w) => `${num(w, "n")} - ${str(w, "nome")} · ${brl(num(w, "preco"))}`,

  editar_servico: (w) =>
    [
      `${str(w, "nome")} · ${tempo(num(w, "minutos"))} · ${brl(num(w, "preco"))}`,
      "",
      "1 - Mudar o preço",
      "2 - Mudar o tempo",
      "3 - Tirar da lista",
      `${num(w, "voltar")} - Voltar`,
    ].join("\n"),

  editar_produto: (w) =>
    [
      `${str(w, "nome")} · ${brl(num(w, "preco"))}`,
      "",
      "1 - Mudar o preço",
      "2 - Tirar da lista",
      `${num(w, "voltar")} - Voltar`,
    ].join("\n"),

  mudar_preco: (w) =>
    `${str(w, "nome")} está ${brl(num(w, "preco"))}. Quanto vai ficar?\n\nOu voltar.`,
  mudar_tempo: (w) =>
    `${str(w, "nome")} ocupa ${tempo(num(w, "minutos"))}. Quanto tempo vai levar? (30, 1h, 1h30)\n\nOu voltar.`,

  confirmar_tirar: (w) =>
    [
      `Tirar ${str(w, "nome")} da lista? (sim / não)`,
      "",
      "As comandas antigas não mudam: elas guardam o nome e o preço do dia.",
    ].join("\n"),

  novo_servico: () => "Qual o nome do serviço?\n\nOu voltar.",
  novo_produto: () => "Qual o nome do produto?\n\nOu voltar.",
  novo_preco: (w) => `Quanto custa ${str(w, "nome")}?`,
  novo_tempo: (w) => `Quanto tempo leva ${str(w, "nome")}? (30, 1h, 1h30)`,

  salvo: () => "Pronto ✅",
  tirado: () => "Tirei da lista 👍",

  // --- os dias e o expediente ---------------------------------------------

  dias_horarios: (w) => ["🗓 Dias e horários", "", str(w, "itens")].join("\n"),

  /**
   * Uma linha da semana.
   *
   * O horário chega como `540-720 840-1140`, que é o dado, e vira "09:00 às
   * 12:00 e 14:00 às 19:00" aqui — o motor não escreve hora nenhuma.
   */
  linha_dia_semana: (w) => {
    const nome = DIAS[Number(w["dia"])] ?? "";
    const fim = num(w, "aberto") === 1 ? faixas(str(w, "horario")) : "fechado";
    return `${num(w, "n")} - ${nome} · ${fim}`;
  },

  item_todos_dias: (w) => `${num(w, "n")} - Todos os dias de uma vez`,
  item_fechados: (w) => `${num(w, "n")} - Dias fechados (${num(w, "quantos")})`,

  editar_todos: (w) =>
    [
      "Todos os dias que abrem",
      "",
      "1 - Mudar a abertura",
      "2 - Mudar o fechamento",
      "3 - Mudar o almoço",
      "4 - Deixar todos iguais",
      `${num(w, "voltar")} - Voltar`,
      "",
      "Não altera dia já fechado.",
    ].join("\n"),

  igual_abre: () =>
    [
      "Vou perguntar o dia inteiro e repetir em todos os dias que abrem.",
      "Depois você ajusta o que for diferente, dia por dia.",
      "",
      "Abre que horas?",
      "",
      "Ou voltar.",
    ].join("\n"),

  igual_fecha: (w) => `Abre ${hora(num(w, "abre"))}. E fecha que horas?\n\nOu voltar.`,

  igual_almoco: () =>
    ["O almoço começa que horas?", "", "0 - Sem pausa pra almoço", "", "Ou voltar."].join("\n"),

  editar_dia_aberto: (w) => {
    const almoco =
      num(w, "almoco_ate") > 0
        ? `Almoço: ${hora(num(w, "almoco_de"))} às ${hora(num(w, "almoco_ate"))}`
        : "Sem almoço, direto";
    return [
      `${DIAS[Number(w["dia"])] ?? ""}`,
      `Abre ${hora(num(w, "abre"))}, fecha ${hora(num(w, "fecha"))}`,
      almoco,
      "",
      "1 - Mudar a abertura",
      "2 - Mudar o fechamento",
      "3 - Mudar o almoço",
      "4 - Fechar neste dia da semana",
      `${num(w, "voltar")} - Voltar`,
    ].join("\n");
  },

  editar_dia_fechado: (w) =>
    [
      `${DIAS[Number(w["dia"])] ?? ""} · fechado`,
      "",
      "1 - Abrir neste dia",
      `${num(w, "voltar")} - Voltar`,
    ].join("\n"),

  mudar_abertura: (w) =>
    [
      num(w, "todos") === 1
        ? "Todos os dias que abrem passam a abrir que horas?"
        : `Abre ${hora(num(w, "abre"))}. Passa a abrir que horas?`,
      "",
      "Ou voltar.",
    ].join("\n"),

  mudar_fechamento: (w) =>
    [
      num(w, "todos") === 1
        ? "Todos os dias que abrem passam a fechar que horas?"
        : `Fecha ${hora(num(w, "fecha"))}. Passa a fechar que horas?`,
      "",
      "Ou voltar.",
    ].join("\n"),

  /**
   * A opção zero.
   *
   * Tirar o almoço não é uma hora, então não cabia na mesma frase da pergunta —
   * e a frase que tentava explicar as duas coisas ("responde a hora, sem para
   * tirar o almoço") só confundia. Vira uma linha numerada, como todo o resto
   * do bot, e o zero é o número que sobra: nenhuma hora do dia é zero.
   *
   * Num dia que já não tem almoço a linha não aparece — ela desfaria algo que
   * não existe.
   */
  mudar_almoco: (w) =>
    num(w, "todos") === 1
      ? [
          "O almoço de todos os dias passa a começar que horas?",
          "",
          "0 - Sem pausa pra almoço",
          "",
          "Ou voltar.",
        ].join("\n")
      : num(w, "tem") === 1
      ? [
          `Almoço das ${hora(num(w, "de"))} às ${hora(num(w, "ate"))}. Passa a começar que horas?`,
          "",
          "0 - Sem pausa pra almoço",
          "",
          "Ou voltar.",
        ].join("\n")
      : ["Não tem almoço neste dia. Passa a começar que horas?", "", "Ou voltar."].join("\n"),

  almoco_ate: (w) => `Almoço a partir das ${hora(num(w, "de"))}. Até que horas?`,

  dias_fechados: (w) =>
    [
      num(w, "quantos") === 0 ? "Nenhum dia fechado por enquanto." : "🚫 Dias fechados:",
      "",
      str(w, "itens"),
    ].join("\n"),
  item_dia_fechado: (w) => `${num(w, "n")} - ${dia(str(w, "dia"))}`,
  item_fechar_dia: (w) => `${num(w, "n")} - Fechar um dia`,

  pedir_dia_fechado: () =>
    ["Qual dia você não vai abrir? (25/12, sexta, amanhã)", "", "Ou voltar."].join("\n"),

  dia_fechado: () => "Fechado nesse dia 👍 Ele some da agenda do cliente.",

  dia_tem_gente: (w) =>
    [
      "Não dá: esse dia tem horário marcado 😕",
      "",
      str(w, "itens"),
      "",
      "Cancela ou remarca com essas pessoas primeiro, aí você fecha o dia.",
    ].join("\n"),
  item_marcado_no_dia: (w) =>
    `· ${dia(str(w, "dia"))} ${hora(num(w, "hora"))} · ${str(w, "nome")} · ${str(w, "servico")}`,

  horario_invalido: () =>
    "Esse horário não fecha 😕 A abertura vem antes do fechamento, e o almoço no meio dos dois.",

  confirmar_reabrir: (w) => `Abrir ${dia(str(w, "dia"))} de novo? (sim / não)`,

  menu_relatorio: (w) =>
    [
      "Relatório de quando?",
      "",
      "1 - Hoje",
      "2 - Esta semana",
      "3 - Este mês",
      "4 - Outro dia",
      `${num(w, "voltar")} - Voltar`,
    ].join("\n"),

  /**
   * O relatório, com o bloco de produtos só quando saiu algum.
   *
   * Uma barbearia que não vende nada da prateleira não precisa ler "Produtos:
   * R$ 0,00" toda vez, e uma que vende quer ver os dois números separados: o
   * que rendeu a mão e o que rendeu a estante.
   */
  relatorio: (w) => {
    const produtos = str(w, "produtos");
    return [
      `📊 ${periodoEscrito(str(w, "de"), str(w, "ate"))}`,
      "",
      `Faturado: ${brl(num(w, "faturado"))} em ${num(w, "atendimentos")} atendimento${num(w, "atendimentos") === 1 ? "" : "s"}`,
      ...(produtos === ""
        ? []
        : [
            `· Serviços: ${brl(num(w, "em_servicos"))}`,
            `· Produtos: ${brl(num(w, "em_produtos"))}`,
          ]),
      "",
      "Por serviço",
      str(w, "servicos"),
      ...(produtos === "" ? [] : ["", "Produtos", produtos]),
      "",
      "Pagamento",
      str(w, "pagamentos"),
      "",
      `Faltas: ${num(w, "faltas")}`,
    ].join("\n");
  },

  linha_item: (w) => `· ${str(w, "nome")} ${num(w, "quantidade")}× — ${brl(num(w, "total"))}`,
  linha_pagamento: (w) => `· ${forma(str(w, "forma"))} — ${brl(num(w, "total"))}`,

  relatorio_vazio: (w) =>
    `Nenhuma comanda fechada em ${periodoEscrito(str(w, "de"), str(w, "ate"))}.`,
};
