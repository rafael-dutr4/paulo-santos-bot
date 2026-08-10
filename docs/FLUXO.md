# O fluxo

A conversa inteira é a tabela de `src/bot/flow.ts`. Este documento é a mesma
tabela escrita para ler, estado por estado.

Convenções:

- **diz** é o que o cliente recebe ao entrar no estado.
- **aceita** são as respostas que o estado entende.
- **segue** é para onde ele vai sem esperar resposta.

## Regras globais

Valem em qualquer ponto, e são testadas antes das transições do estado. É por
isso que ninguém fica preso dentro de um agendamento pela metade.

| resposta | vai para |
| --- | --- |
| `menu`, `voltar`, `opcoes` | `menu` |
| `sair`, `tchau`, `encerrar` | `despedida` |

Três respostas seguidas que o bot não entende levam a `humano`. O contador
zera assim que uma resposta é entendida.

## Entrada

| estado | comportamento |
| --- | --- |
| `inicio` | Não diz nada. O cliente fala primeiro, como no WhatsApp. Qualquer mensagem leva a `saudacao`. |
| `saudacao` | Diz quem é. **Segue** para `menu`. |
| `menu` | O menu numerado. Entrar aqui apaga o rascunho: quem desiste no meio não carrega meio agendamento. |

Opções do menu:

| opção | vai para |
| --- | --- |
| 1 | `escolher_servico` |
| 2 | `meus_agendamentos`, ou `sem_agendamentos` se não houver nenhum |
| 3 | `precos` |
| 4 | `horarios` |
| 5 | `endereco` |
| 6 | `humano` |

`precos`, `horarios` e `endereco` dizem o que sabem e seguem de volta para o
`menu`, então uma pergunta produz duas mensagens.

## Agendamento

| estado | comportamento |
| --- | --- |
| `escolher_servico` | Lista os serviços com preço e duração. Guarda a lista nas ofertas da sessão. Vai para `escolher_dia`, ou `sem_horarios` se não houver dia livre. |
| `escolher_dia` | Lista os próximos dias que têm horário livre para o serviço escolhido. Dia fechado e dia lotado não aparecem. |
| `escolher_hora` | Lista até oito horários do dia. Se houver mais, a última opção é "ver mais horários", que avança a página e volta ao começo quando acaba. |
| `pedir_nome` | Só aparece para quem o bot ainda não conhece. |
| `confirmar` | Repete serviço, dia, hora e valor, e pergunta. |
| `agendado` | Confirma e **segue** para o `menu`. |
| `slot_ocupado` | O horário foi ocupado entre a oferta e o "sim". Volta para `escolher_hora`, na primeira página. |
| `nao_agendado` | O cliente disse não. Nada foi marcado. |
| `sem_horarios` | Não há horário livre no horizonte da agenda. |

A reserva sai do motor como efeito, não como escrita:

```
{ kind: "book", appointment }
```

## Cancelar e remarcar

| estado | comportamento |
| --- | --- |
| `meus_agendamentos` | Lista os horários futuros deste número. Escolher um guarda o agendamento no rascunho como `replacing` e adota o nome que já está lá. |
| `o_que_fazer` | 1 cancelar, 2 remarcar, 3 voltar. |
| `confirmar_cancelamento` | Repete o agendamento e pergunta. |
| `cancelado` / `cancelamento_abortado` | O fim de cada caminho. |

Remarcar não tem fluxo próprio: ele reaproveita `escolher_dia` e
`escolher_hora`. O agendamento antigo sai da agenda enquanto os horários livres
são calculados, senão ele bloquearia o próprio horário, e a confirmação emite
dois efeitos:

```
[{ kind: "cancel", id }, { kind: "book", appointment }]
```

## O que o fluxo não faz

- Não entende texto livre. Quem escreve "quero cortar o cabelo amanhã" recebe o
  menu de novo, e depois de três tentativas fala com o barbeiro.
- Não escolhe profissional. A barbearia tem uma agenda só.
- Não manda lembrete véspera. Isso depende de alguém rodando fora da conversa,
  o que é trabalho da integração.
