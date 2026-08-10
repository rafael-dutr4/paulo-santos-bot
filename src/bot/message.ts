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
  | "escolher_servico"
  | "item_servico"
  | "escolher_dia"
  | "item_dia"
  | "escolher_periodo"
  | "item_periodo"
  | "escolher_hora"
  | "item_hora"
  | "item_outro_periodo"
  | "hora_indisponivel"
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
  | "cancelamento_abortado";

export type Param = string | number | Message | Message[];
export type Params = Record<string, Param>;

export type Message = { key: MessageKey; params?: Params };

export function msg(key: MessageKey, params?: Params): Message {
  return params === undefined ? { key } : { key, params };
}
