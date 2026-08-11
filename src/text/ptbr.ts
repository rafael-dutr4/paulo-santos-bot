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

  escolher_dia: (w) =>
    [
      `${str(w, "servico")}. Para quando?`,
      "",
      str(w, "itens"),
      "",
      "Se quiser trocar o serviço, é só dizer voltar.",
    ].join("\n"),
  item_dia: (w) => `${num(w, "n")} - ${dia(str(w, "dia"))}`,

  escolher_hora: (w) =>
    [
      `Horários livres em ${dia(str(w, "dia"))}:`,
      str(w, "itens"),
      "",
      "Responde com o número ou com o horário.",
      "Se nenhum servir, diz voltar que eu mostro os outros dias.",
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

  pedir_dia: () => "Qual dia? (hoje, ontem, quinta, quinta passada, 10/08)",

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
      "Responde o valor (45, 45,50) ou tirar para remover.",
    ].join("\n"),

  escolher_pagamento: (w) =>
    [`Total: ${brl(num(w, "total"))}`, "", "Como pagou?", "", str(w, "itens")].join("\n"),
  item_pagamento: (w) => `${num(w, "n")} - ${forma(str(w, "forma"))}`,

  comanda_fechada: (w) =>
    `Fechada: ${str(w, "nome")}, ${brl(num(w, "total"))} ✅`,

  comanda_faltou: (w) => `Anotado: ${str(w, "nome")} não veio.`,

  menu_relatorio: () =>
    ["Relatório de quando?", "", "1 - Hoje", "2 - Esta semana", "3 - Este mês", "4 - Outro dia"].join(
      "\n",
    ),

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
