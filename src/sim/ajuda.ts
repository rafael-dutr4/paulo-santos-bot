/**
 * A ajuda: como se pede cada coisa ao bot.
 *
 * O conteúdo é dado, e não markup escrito à mão no `index.html`, por uma razão
 * que vale o arquivo: uma receita é uma sequência de mensagens, e uma sequência
 * de mensagens o motor sabe rodar. `tests/ajuda.test.ts` digita os passos de
 * cada receita em `reply()` e confere que a conversa chega onde a receita
 * promete. Uma resposta que muda de número, um estado que ganha uma pergunta a
 * mais, um serviço que sai do catálogo, qualquer um desses quebra o teste, e a
 * ajuda não tem como envelhecer em silêncio.
 *
 * É a mesma ideia de `tests/conversas/*.txt`: a documentação que não é conferida
 * é a documentação que ninguém acredita.
 */

import type { MessageKey } from "../bot/message.ts";

export type Quem = "cliente" | "barbeiro";

/** Um passo: o que se digita e o que o bot faz com isso. */
export type Passo = { diga: string; entao: string };

export type Receita = {
  pergunta: string;
  quem: Quem;
  /** A frase da precondição, para quem lê. */
  precisa?: string;
  /** As mensagens que criam essa precondição, para o teste. */
  antes?: string[];
  /** O banco que a receita precisa, pelas mesmas semeaduras do painel. */
  semear?: "futuro" | "historico";
  passos: Passo[];
  /** Uma mensagem que o último turno tem que dizer. É o que o teste confere. */
  chega: MessageKey;
  nota?: string;
};

/** O dia em que as receitas foram escritas, e em que o teste as roda. */
export const RECEITAS_EM = { day: "2026-08-10", at: 10 * 60 };

// --- como se pede cada coisa ----------------------------------------------

export const RECEITAS: Receita[] = [
  {
    pergunta: "Como marco um horário?",
    quem: "cliente",
    passos: [
      { diga: "oi", entao: "O bot cumprimenta e já abre o menu, na mesma mensagem." },
      { diga: "1", entao: "Agendar um horário. Ele mostra as faixas da tabela." },
      { diga: "1", entao: "Barbearia. Ele lista os serviços dessa faixa." },
      { diga: "1", entao: "Corte. Ele lista os próximos dias." },
      { diga: "1", entao: "O primeiro dia. Ele lista as horas livres, por período." },
      { diga: "1", entao: "A primeira hora livre. Ele pede o nome." },
      { diga: "Rafa", entao: "Ele repete tudo e pergunta se está certo." },
      { diga: "sim", entao: "Marcado." },
    ],
    chega: "agendado",
    nota: "A tabela é partida em faixas porque ela inteira passa das dez linhas que uma lista do WhatsApp abre. Na pergunta da hora dá para responder “14:30” ou “duas e meia” em vez do número. Se a hora pedida não estiver livre, o bot oferece a mais perto.",
  },
  {
    pergunta: "Como cancelo um horário?",
    quem: "cliente",
    precisa: "ter um horário marcado.",
    antes: ["oi", "1", "1", "1", "1", "1", "Rafa", "sim"],
    passos: [
      { diga: "menu", entao: "Volta para o menu de qualquer lugar." },
      { diga: "2", entao: "Ver meus agendamentos. Ele lista o que você tem." },
      { diga: "1", entao: "O horário. Ele pergunta o que fazer com ele." },
      { diga: "1", entao: "Cancelar. Ele pede confirmação." },
      { diga: "sim", entao: "Cancelado, e a hora volta a ficar livre." },
    ],
    chega: "cancelado",
  },
  {
    pergunta: "Como remarco um horário?",
    quem: "cliente",
    precisa: "ter um horário marcado.",
    antes: ["oi", "1", "1", "1", "1", "1", "Rafa", "sim"],
    passos: [
      { diga: "menu", entao: "Volta para o menu." },
      { diga: "2", entao: "Ver meus agendamentos." },
      { diga: "1", entao: "O horário." },
      { diga: "2", entao: "Remarcar. Ele pergunta o dia de novo." },
      { diga: "2", entao: "O novo dia. Ele lista as horas livres." },
      { diga: "1", entao: "A nova hora. Ele mostra o antes e o depois." },
      { diga: "sim", entao: "Remarcado: o horário velho é desmarcado no mesmo passo." },
    ],
    chega: "remarcado",
    nota: "O horário que está sendo movido não bloqueia a si mesmo: ele sai da agenda enquanto o bot calcula as horas livres, e só volta se a remarcação for confirmada.",
  },
  {
    pergunta: "Como mudo o preço de um serviço?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "5", entao: "Serviços e produtos. Ele lista o catálogo inteiro, com preço e tempo." },
      { diga: "1", entao: "Corte, a primeira linha da lista." },
      { diga: "1", entao: "Mudar o preço." },
      { diga: "50", entao: "Salvo. Vale “50”, “R$ 50” e “49,90”." },
    ],
    chega: "salvo",
    nota: "O preço novo aparece no menu do cliente no turno seguinte, sem ninguém avisar ninguém: as duas conversas leem o mesmo banco. E ele não reescreve o passado, cada comanda copiou o preço do dia em que foi fechada.",
  },
  {
    pergunta: "Como mudo o tempo que um serviço ocupa a cadeira?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "5", entao: "Serviços e produtos." },
      { diga: "1", entao: "Corte." },
      { diga: "2", entao: "Mudar o tempo." },
      { diga: "1h30", entao: "Salvo. Vale “90”, “1h30” e “meia hora”." },
    ],
    chega: "salvo",
    nota: "O tempo é o que a grade de horários usa para saber onde um corte cabe. Aumentar o tempo diminui as horas que o cliente vê livres.",
  },
  {
    pergunta: "Como mudo um serviço de faixa da tabela?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "5", entao: "Serviços e produtos." },
      { diga: "1", entao: "Corte." },
      { diga: "3", entao: "Mudar a faixa. Ele mostra as três." },
      { diga: "2", entao: "Tratamentos. Salvo." },
    ],
    chega: "salvo",
    nota: "As faixas são três e não mudam pela conversa: elas são como a barbearia se descreve, e é isso que o cliente lê na tabela e no agendamento. O que muda é em qual delas cada serviço entra.",
  },
  {
    pergunta: "Como cadastro um serviço novo?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "5", entao: "Serviços e produtos." },
      {
        diga: "23",
        entao: "Novo serviço, a penúltima linha da lista, logo antes de “Novo produto”.",
      },
      { diga: "Relaxamento", entao: "O nome. Ele pergunta o preço." },
      { diga: "60", entao: "O preço. Ele pergunta o tempo, porque serviço ocupa a cadeira." },
      { diga: "45", entao: "O tempo. Ele pergunta em qual faixa da tabela ele entra." },
      { diga: "1", entao: "Barbearia. Salvo, e já aparece para o cliente." },
    ],
    chega: "salvo",
    nota: "O número de “Novo serviço” muda com o tamanho do catálogo: são as duas últimas linhas antes de “Voltar”. Nada é gravado antes da faixa, que é a última resposta. O id sai do nome: “Água de coco” vira `agua_de_coco`, sempre o mesmo para o mesmo nome.",
  },
  {
    pergunta: "Como cadastro um produto novo?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "5", entao: "Serviços e produtos." },
      { diga: "24", entao: "Novo produto, a última linha antes de “Voltar”." },
      { diga: "Água de coco", entao: "O nome. Ele pergunta o preço." },
      { diga: "8", entao: "Salvo. Produto não tem tempo: ele não ocupa a cadeira." },
    ],
    chega: "salvo",
    nota: "Produto não aparece no menu do cliente. Ele nasce e morre dentro de uma comanda, que é onde o barbeiro registra o que o cliente levou.",
  },
  {
    pergunta: "Como tiro um serviço da lista?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "5", entao: "Serviços e produtos." },
      { diga: "4", entao: "Bigode, a quarta linha." },
      { diga: "4", entao: "Tirar da lista. Ele pede confirmação." },
      { diga: "sim", entao: "Tirado." },
    ],
    chega: "tirado",
    nota: "Tirar da lista não mexe em comanda nenhuma: elas guardam o nome e o preço do dia. Num produto a opção de tirar é a 2, porque produto não tem tempo nem faixa para mudar.",
  },
  {
    pergunta: "Como fecho a comanda de um atendimento?",
    quem: "barbeiro",
    semear: "historico",
    precisa: "ter um atendimento que já começou e ninguém fechou.",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "3", entao: "Fechar comanda. Ele lista o que já passou e continua em aberto." },
      { diga: "1", entao: "O atendimento. Ele pergunta se o cliente veio." },
      { diga: "sim", entao: "Ele abre a comanda com o serviço marcado e o total." },
      { diga: "2", entao: "Acrescentar produto. Ele mostra a prateleira." },
      { diga: "4", entao: "Refrigerante. Ele volta para a comanda, com o total novo." },
      { diga: "4", entao: "Ir para o pagamento. Ele mostra o total e as formas." },
      { diga: "2", entao: "Pix. Comanda fechada." },
    ],
    chega: "comanda_fechada",
    nota: "Nada é escrito antes da forma de pagamento: a comanda vive no rascunho da sessão, e desistir no meio não deixa rastro. A opção 3 da comanda corrige um valor, e “tirar” no lugar do valor apaga a linha.",
  },
  {
    pergunta: "Como marco que o cliente faltou?",
    quem: "barbeiro",
    semear: "historico",
    precisa: "ter um atendimento que já começou e ninguém fechou.",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "3", entao: "Fechar comanda." },
      { diga: "1", entao: "O atendimento. Ele pergunta se o cliente veio." },
      { diga: "não", entao: "Fecha na hora, sem valor e sem mais perguntas." },
    ],
    chega: "comanda_faltou",
    nota: "A falta entra no relatório como falta, e não some: ela é o que explica uma hora vazia num dia cheio.",
  },
  {
    pergunta: "Como vejo o relatório do mês?",
    quem: "barbeiro",
    semear: "historico",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "4", entao: "Relatório. Ele pergunta o período." },
      { diga: "3", entao: "Este mês, do dia 1 ao último." },
    ],
    chega: "relatorio",
    nota: "O relatório soma as comandas do período: o faturado partido entre serviços e produtos, quantos atendimentos, o que saiu de cada coisa, quanto entrou por forma de pagamento e quantos faltaram. A opção 4 pede um dia qualquer.",
  },
  {
    pergunta: "Como vejo a agenda de outro dia?",
    quem: "barbeiro",
    semear: "futuro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "2", entao: "Agenda de outro dia. Ele pergunta qual." },
      {
        diga: "amanhã",
        entao: "O dia inteiro, com a situação de cada horário: ✓ fechado, ✗ faltou, • em aberto.",
      },
    ],
    chega: "agenda_do_dia",
    nota: "Vale “hoje”, “ontem”, “quinta”, “quinta passada”, “10/08” e “10/08/2025”. O nome do dia anda para a frente, e volta quando a frase diz que é passado.",
  },
  {
    pergunta: "Como mudo o horário de abertura de um dia?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "6", entao: "Dias e horários. Ele mostra a semana inteira." },
      { diga: "1", entao: "Segunda-feira." },
      { diga: "1", entao: "Mudar a abertura." },
      { diga: "08:00", entao: "Salvo. Vale “8”, “08:00” e “oito da manhã”." },
    ],
    chega: "salvo",
    nota: "Abrir depois de fechar não é horário, é engano: o bot recusa e não salva nada. A opção 3 mexe no almoço, e “0” tira o almoço do dia.",
  },
  {
    pergunta: "Como deixo todos os dias com o mesmo horário?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "6", entao: "Dias e horários." },
      { diga: "8", entao: "Todos os dias de uma vez." },
      { diga: "4", entao: "Deixar todos iguais. Ele pergunta o dia inteiro, de uma vez." },
      { diga: "09:00", entao: "A abertura." },
      { diga: "19:00", entao: "O fechamento." },
      { diga: "12:00", entao: "O começo do almoço, “0” aqui é um dia sem almoço." },
      { diga: "13:00", entao: "O fim do almoço. Salvo em todos os dias que abrem." },
    ],
    chega: "salvo",
    nota: "Dia fechado continua fechado: abrir a semana toda por engano seria o tipo de estrago que o bot não pode fazer com uma tecla. Nada é escrito antes da última resposta, e depois disso cada dia ainda se muda sozinho.",
  },
  {
    pergunta: "Como travo um horário de um dia (médico, compromisso)?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "7", entao: "Travar um horário. Ele lista o que já está travado." },
      { diga: "1", entao: "Travar um horário, é sempre a última linha antes de “Voltar”." },
      { diga: "sexta", entao: "O dia. Vale “sexta”, “21/08” e “amanhã”." },
      { diga: "15:00", entao: "A partir de que horas. Vale “três da tarde”." },
      { diga: "16:00", entao: "Até que horas. Travado, e o cliente não vê mais esse pedaço." },
    ],
    chega: "bloqueado",
    nota: "Travar é o irmão pequeno de fechar um dia: fechar tira o dia inteiro da conta, travar tira um pedaço de um dia que abre. Nada é escrito antes da última resposta, e um horário que não fecha (o fim antes do começo) é recusado sem salvar nada.",
  },
  {
    pergunta: "E se já tiver gente marcada no horário que eu quero travar?",
    quem: "barbeiro",
    precisa: "ter alguém marcado dentro do pedaço que se quer travar.",
    semear: "futuro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "7", entao: "Travar um horário." },
      { diga: "1", entao: "Travar um horário." },
      { diga: "amanhã", entao: "O dia." },
      { diga: "08:00", entao: "A partir de que horas." },
      {
        diga: "20:00",
        entao: "O bot mostra quem está marcado ali e não trava nada.",
      },
    ],
    chega: "hora_tem_gente",
    nota: "Travar por cima de um agendamento seria desmarcar alguém sem avisar, e isso o bot não faz com uma tecla. Cancele ou remarque com essas pessoas primeiro (pela conversa delas), e aí o horário trava.",
  },
  {
    pergunta: "Como destravo um horário?",
    quem: "barbeiro",
    precisa: "ter um horário travado.",
    antes: ["oi", "7", "1", "sexta", "15:00", "16:00"],
    passos: [
      { diga: "menu", entao: "Volta para o menu." },
      { diga: "7", entao: "Travar um horário. A lista mostra o que está travado." },
      { diga: "1", entao: "O travado. Destravado, e ele volta para a lista do cliente." },
    ],
    chega: "desbloqueado",
    nota: "A lista só mostra o que ainda não passou: um bloqueio de ontem não é escolha nenhuma. É a mesma regra das datas fechadas.",
  },
  {
    pergunta: "Como fecho um dia (feriado, folga)?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "6", entao: "Dias e horários." },
      { diga: "9", entao: "Dias fechados. Ele lista as datas de hoje para a frente." },
      { diga: "4", entao: "Fechar um dia, é sempre a última linha antes de “Voltar”." },
      { diga: "20/11", entao: "Fechado. O dia some da lista do cliente no turno seguinte." },
    ],
    chega: "dia_fechado",
    nota: "O número de “Fechar um dia” anda com o tamanho da lista, conte de baixo para cima. Um dia que já tem gente marcada não fecha: o bot mostra quem está marcado e manda cancelar ou remarcar antes. Falar com essas pessoas não é trabalho de bot. Para reabrir, escolha a data na mesma lista.",
  },
  {
    pergunta: "Como fecho um dia da semana inteiro (não abre mais na segunda)?",
    quem: "barbeiro",
    passos: [
      { diga: "oi", entao: "O menu do barbeiro." },
      { diga: "6", entao: "Dias e horários." },
      { diga: "1", entao: "Segunda-feira." },
      { diga: "4", entao: "Fechar neste dia da semana. Ele pede confirmação." },
      { diga: "sim", entao: "Salvo. A barbearia não abre mais nesse dia da semana." },
    ],
    chega: "salvo",
    nota: "Num dia já fechado a única opção é “Abrir neste dia”, e abrir copia o expediente de um dia que já abre.",
  },
];

// --- a tela ----------------------------------------------------------------

/**
 * A ajuda desenhada, uma pergunta por `<details>`.
 *
 * O acordeão é do navegador: `<details>` abre e fecha sozinho, e não há um
 * segundo lugar guardando qual pergunta está aberta. É a mesma escolha das
 * abas, que usam `aria-selected` como estado em vez de uma cópia.
 */
export function ajuda(root: HTMLElement): void {
  root.replaceChildren();

  root.append(titulo("Como se faz"));
  const nota = document.createElement("p");
  nota.className = "nota";
  nota.textContent =
    "Cada receita é uma conversa de verdade: os passos são digitados no bot pelo teste, " +
    "e ele confere que a conversa chega onde a receita promete.";
  root.append(nota);

  for (const receita of RECEITAS) root.append(cartao(receita));
}

function titulo(texto: string): HTMLElement {
  const node = document.createElement("h2");
  node.textContent = texto;
  return node;
}

function cartao(receita: Receita): HTMLElement {
  const node = document.createElement("details");
  node.className = "receita";

  const pergunta = document.createElement("summary");
  pergunta.textContent = receita.pergunta;
  const quem = document.createElement("span");
  quem.className = `quem-${receita.quem}`;
  quem.textContent = receita.quem;
  pergunta.append(quem);
  node.append(pergunta);

  if (receita.precisa) {
    const antes = document.createElement("p");
    antes.className = "precisa";
    antes.textContent = `Precisa: ${receita.precisa}`;
    node.append(antes);
  }

  const passos = document.createElement("ol");
  passos.className = "passos";
  for (const passo of receita.passos) {
    const item = document.createElement("li");
    const diga = document.createElement("code");
    diga.textContent = passo.diga;
    const entao = document.createElement("span");
    entao.textContent = passo.entao;
    item.append(diga, entao);
    passos.append(item);
  }
  node.append(passos);

  if (receita.nota) {
    const nota = document.createElement("p");
    nota.className = "nota";
    nota.textContent = receita.nota;
    node.append(nota);
  }
  return node;
}
