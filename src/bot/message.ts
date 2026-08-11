/**
 * What the bot says, named instead of worded.
 *
 * The engine returns a `Message`: a key and the data that fills it. The
 * sentence itself lives in `src/text/ptbr.ts` and nowhere else. Two things fall
 * out of that:
 *
 * - a test asserts on `escolher_hora`, so fixing a comma in a greeting never
 *   breaks a test;
 * - the WhatsApp adapter can word the same key with WhatsApp's own `*negrito*`
 *   without the engine knowing.
 *
 * A param can itself be a message, which is how a numbered list is built: the
 * state names `escolher_servico` with a list of `item_servico`, and the text
 * module words each item and joins them.
 *
 */

export type MessageKey =
  // conversa
  | "saudacao"
  | "menu"
  | "nao_entendi"
  | "despedida"
  | "humano"
  // informações
  | "precos"
  | "horarios"
  | "endereco"
  // agendamento
  | "ja_tem_horario"
  | "item_marcado"
  | "escolher_servico"
  | "item_servico"
  | "escolher_dia"
  | "item_dia"
  | "escolher_hora"
  | "cabecalho_periodo"
  | "item_hora"
  | "hora_indisponivel"
  | "aproximei"
  | "sem_horarios"
  | "pedir_nome"
  | "resumo"
  | "resumo_remarcacao"
  | "confirmar"
  | "slot_ocupado"
  | "agendado"
  | "remarcado"
  | "nao_agendado"
  // agendamentos do cliente
  | "meus_agendamentos"
  | "item_agendamento"
  | "sem_agendamentos"
  | "o_que_fazer"
  | "confirmar_cancelamento"
  | "cancelado"
  | "cancelamento_abortado"
  // o barbeiro
  | "saudacao_barbeiro"
  | "menu_barbeiro"
  | "despedida_barbeiro"
  | "agenda_do_dia"
  | "item_agenda"
  | "agenda_vazia"
  | "pedir_dia"
  // comandas
  | "comandas_pendentes"
  | "item_pendente"
  | "nada_a_fechar"
  | "compareceu"
  | "comanda"
  | "item_comanda"
  | "servico_extra"
  | "produto_extra"
  | "item_produto"
  | "escolher_item"
  | "item_para_corrigir"
  | "pedir_valor"
  | "escolher_pagamento"
  | "item_pagamento"
  | "comanda_fechada"
  | "comanda_faltou"
  // o catálogo
  | "catalogo"
  | "linha_catalogo_servico"
  | "linha_catalogo_produto"
  | "editar_servico"
  | "editar_produto"
  | "mudar_preco"
  | "mudar_tempo"
  | "confirmar_tirar"
  | "novo_servico"
  | "novo_produto"
  | "novo_preco"
  | "novo_tempo"
  | "salvo"
  | "tirado"
  // relatório
  | "menu_relatorio"
  | "relatorio"
  | "linha_item"
  | "linha_pagamento"
  | "relatorio_vazio";

export type Param = string | number | Message | Message[];
export type Params = Record<string, Param>;

export type Message = { key: MessageKey; params?: Params };

export function msg(key: MessageKey, params?: Params): Message {
  return params === undefined ? { key } : { key, params };
}
