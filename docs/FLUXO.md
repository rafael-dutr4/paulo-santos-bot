# O fluxo

São duas conversas, e duas tabelas: a do cliente em `src/bot/flow.ts` e a do
barbeiro em `src/bot/barbeiro.ts`. O telefone escolhe qual roda — quem está em
`SHOP.barbers` fala com a segunda — e o interpretador é o mesmo para as duas.
Este documento é a mesma tabela escrita para ler, estado por estado.

Convenções:

- **diz** é o que o cliente recebe ao entrar no estado.
- **aceita** são as respostas que o estado entende.
- **segue** é para onde ele vai sem esperar resposta.

O `ctx` que o motor recebe é uma foto do mundo tirada no começo do turno, e a
tabela diz como avançá-la (`advance`): um estado que emite um efeito e logo em
seguida mostra uma lista mostra a lista com o efeito dentro. Sem isso a regra
seria "um estado ou escreve ou mostra", que é uma regra que ninguém lembra na
hora de escrever o vigésimo estado.

## Regras globais

Valem em qualquer ponto, e são testadas antes das transições do estado. É por
isso que ninguém fica preso dentro de um agendamento pela metade.

| resposta | vai para |
| --- | --- |
| `menu`, `opcoes` | `menu` |
| `voltar` | o `back` do estado atual, ou `menu` se ele não tiver um |
| `sair`, `tchau`, `encerrar` | `despedida` |

Toda lista numerada termina em `N - Voltar`, e esse número faz o mesmo que a
palavra. Quem lê um menu numerado não adivinha que também pode digitar uma
palavra, então a saída precisa estar na lista. A última linha é posta por
`numbered()`, que sabe quantos itens saíram, e atendida por uma regra global —
um estado novo com lista ganha a saída de graça. Nos menus de tamanho fixo, o
número é uma constante usada no texto e na transição.

Os dois menus de entrada (`menu` e `menu_barbeiro`) não têm essa linha: atrás
deles não há nada, e uma opção que repete o mesmo menu é ruído.

Entrar em qualquer estado apaga as ofertas do estado anterior — elas pertencem a
quem as fez. Sem isso, um `2` respondido a uma pergunta de sim ou não seria
resolvido contra a lista que a tela passada mostrou.

`voltar` é um passo atrás, não o menu. Quem abriu as horas de um dia e não
gostou de nenhuma queria trocar o dia, e o menu apagaria também o serviço que
ele já tinha escolhido:

| estado | volta para |
| --- | --- |
| `escolher_hora` | `escolher_dia` |
| `escolher_dia` | `escolher_servico` |

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
| 1 | `ja_tem_horario` se já houver um marcado, senão `escolher_servico` |
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
| `ja_tem_horario` | Quem já tem horário marcado lê quais são antes de marcar outro. `sim` segue para `escolher_servico`, `não` leva a `meus_agendamentos`. |
| `escolher_servico` | Lista os serviços com preço e duração. Guarda a lista nas ofertas da sessão. Vai para `escolher_dia`, ou `sem_horarios` se não houver dia livre. |
| `escolher_dia` | Lista os próximos dias que têm horário livre para o serviço escolhido. Dia fechado e dia lotado não aparecem. |
| `escolher_hora` | Todos os horários livres do dia numa mensagem só, numerados de ponta a ponta, com manhã e tarde como título para dar respiro. Aceita o número da lista e também a hora digitada (`14:30`, `14h30`, `às 14h30`), sempre conferida contra o que foi oferecido. |
| `aproximado` | A hora pedida não existe na grade (`14 e 40`) mas tem vizinha livre a menos de meia hora. Avisa qual é e segue para a confirmação, que repete a hora escolhida. |
| `hora_indisponivel` | A hora dá para ler mas não está livre nem tem vizinha perto. Diz isso e mostra a lista de novo, em vez de responder "não entendi". |

Como o cliente pode dizer a hora:

| ele escreve | o bot entende |
| --- | --- |
| `3` | a terceira linha da lista |
| `14:30`, `14h30`, `18h` | o relógio de 24 horas |
| `duas e meia`, `três e quinze`, `nove e quarenta` | a hora falada |
| `quatro e um quarto`, `quinze pras duas` | as frações da hora |
| `meio dia`, `meia noite` | as duas horas com nome |
| `duas da tarde`, `oito da noite`, `nove da manhã` | o período dito desempata |
| `pode ser 14:30?`, `quero marcar duas e meia` | o pedido embrulhado em conversa |

Uma hora de uma a onze cabe duas vezes no dia, e o leitor não escolhe: ele
devolve as duas leituras (`duas e meia` são 14:30 e 02:30) e vale a primeira que
está livre. É por isso que a tarde ganha sem ninguém escrever uma regra sobre
barbearia dentro do leitor de horas.
| `pedir_nome` | Só aparece para quem o bot ainda não conhece. |
| `confirmar` | Repete serviço, dia, hora e valor, e pergunta. |
| `agendado` | Confirma e **segue** para o `menu`. |
| `slot_ocupado` | O horário foi ocupado entre a oferta e o "sim". Volta para `escolher_hora` com a lista recalculada. |
| `nao_agendado` | O cliente disse não. Nada foi marcado. |
| `sem_horarios` | Não há horário livre no horizonte da agenda. |

O aviso não impede nada: marcar dois horários é permitido, porque o cliente que
corta o cabelo e leva o filho faz isso. Ele existe para quem esqueceu — e o
`não` leva justamente para onde dá para cancelar ou remarcar o que já existe.

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

# O barbeiro

A outra tabela, para o número que está em `SHOP.barbers`. As regras globais são
as mesmas, com `menu_barbeiro` no lugar do menu do cliente, e o destino de quem
erra três vezes também é o menu: o barbeiro não tem a quem ser encaminhado,
porque ele é o humano.

| opção | vai para |
| --- | --- |
| 1 | `agenda`, do dia de hoje |
| 2 | `pedir_dia` e depois `agenda` |
| 3 | `comandas`, ou `nada_a_fechar` |
| 4 | `menu_relatorio` |
| 5 | `catalogo` |
| 6 | `dias_horarios` |

## A agenda

| estado | comportamento |
| --- | --- |
| `agenda` | O dia inteiro, um horário por linha, com a situação de cada um: `✓` fechado (com o valor), `✗` faltou, `•` ainda em aberto. **Segue** para o menu. |
| `pedir_dia` | Aceita o dia escrito à mão: `hoje`, `ontem`, `quinta`, `quinta passada`, `10/08`, `10/08/2025`. Sem lista numerada, porque quem pergunta já conhece a agenda. |

O leitor é `src/text/datas.ts`, e ele devolve as leituras possíveis em ordem,
como o leitor de horas:

| ele escreve | o bot entende |
| --- | --- |
| `hoje`, `ontem`, `anteontem`, `amanhã` | a conta a partir de hoje |
| `quinta`, `quinta-feira`, `quinta que vem` | a próxima quinta; hoje, se hoje for quinta |
| `quinta passada`, `última quinta` | a quinta que ficou para trás |
| `10/08` | o ano mais perto de hoje |
| `10/08/2025`, `2025-08-10` | o ano escrito |

O nome do dia anda para a frente por padrão, porque quem fala assim está
combinando alguma coisa, e volta quando a frase diz que é passado. Uma data sem
ano cai no ano mais perto de hoje, então `28/12` lido em janeiro é o dezembro
que passou.

## A comanda

A agenda é a promessa e a comanda é o registro: quem veio, o que saiu, quanto
deu e como pagou. Uma comanda fecha um horário, e o id dela é o id do
agendamento.

| estado | comportamento |
| --- | --- |
| `comandas` | Os atendimentos que já começaram e ninguém fechou. A lista é uma subtração: a agenda até agora, menos o que já tem comanda. |
| `compareceu` | O cliente veio? `não` fecha a comanda como falta, na hora. |
| `comanda` | As linhas e o total. 1 acrescenta um serviço, 2 acrescenta um produto, 3 corrige um valor, 4 vai para o pagamento. |
| `servico_extra` | A tabela de serviços, para o pezinho que saiu junto. |
| `produto_extra` | A prateleira: pomada, shampoo, refrigerante. Um produto não ocupa a cadeira e não aparece no menu do cliente — ele nasce e morre dentro da comanda. |
| `escolher_item` | Qual linha corrigir, quando há mais de uma. Com uma só, o bot não pergunta. |
| `pedir_valor` | Aceita `45`, `45,50`, `R$ 45`, e `tirar` para remover a linha. |
| `escolher_pagamento` | As formas que a barbearia aceita, de `SHOP.payments`. É a última pergunta de propósito. |
| `comanda_fechada` / `comanda_faltou` | O fim de cada caminho, e **seguem** para o menu. |

Até a forma de pagamento nada foi escrito: a comanda vive no rascunho da sessão,
e desistir no meio não deixa rastro. O fechamento sai como efeito, como o
agendamento:

```
{ kind: "close", comanda }
```

Fechar duas vezes o mesmo horário substitui a comanda em vez de somar duas, pela
mesma razão que `book` substitui pelo id.

## Serviços e produtos

O preço e o tempo mudam com o mercado, e produto novo chega toda semana. Por
isso o catálogo é a única parte da barbearia que mora no banco e não em
`shop.ts` — o resto (endereço, horário, formas de pagamento) muda de ano em ano
e continua sendo dado de código. A casca monta o `Shop` de cada turno pondo o
catálogo guardado por cima da constante, e nada acima disso percebe.

| estado | comportamento |
| --- | --- |
| `catalogo` | Uma lista só, serviços e produtos, com "novo serviço" e "novo produto" como as duas últimas linhas — a mesma numeração de sempre. |
| `editar_item` | Serviço: preço, tempo, tirar. Produto: preço, tirar. A opção 2 significa coisas diferentes nos dois, e é a transição que carrega a condição, não o destino. |
| `mudar_preco` / `mudar_tempo` | Aceitam `50`, `R$ 50`, e `30`, `1h`, `1h30`, `meia hora`. |
| `confirmar_tirar` | Tirar da lista não mexe em comanda nenhuma: elas guardam o nome e o preço do dia. |
| `novo_nome` → `novo_preco` → `novo_tempo` | Produto para no preço; serviço ainda diz quanto tempo ocupa a cadeira. |

O id de um item novo sai do nome: "Água de coco" vira `agua_de_coco`, sempre o
mesmo para o mesmo nome, e ganha um número no fim se já existir um igual.
Nenhum sorteio, como em toda id deste projeto.

O que sai do motor:

```
{ kind: "service", service }   { kind: "product", product }
{ kind: "remove", from: "services" | "products", id }
```

Um preço que o barbeiro muda na conversa dele aparece no menu do cliente no
turno seguinte, sem ninguém avisar ninguém: as duas conversas leem o mesmo
banco. E um aumento não reescreve o passado, porque a comanda copiou o nome e o
preço no dia em que foi fechada.

## Dias e horários

O horário de funcionamento e as datas fechadas moram no banco pela mesma razão
que os preços: o barbeiro decide a folga na quinta à noite, e isso não pode
depender de alguém recompilar.

| estado | comportamento |
| --- | --- |
| `dias_horarios` | A semana, de segunda a domingo, com o horário de cada dia ou "fechado", mais a linha de todos os dias e a das datas fechadas. |
| `editar_todos` | O mesmo editor apontado para a semana inteira. De 1 a 3, cada resposta mexe num campo só e deixa o resto de cada dia como estava. |
| `igual_abre` → `igual_fecha` → `igual_almoco` → `almoco_ate` | "Deixar todos iguais": pergunta o dia inteiro e repete em todos os que abrem. É o caso comum de uma barbearia — de segunda a sexta o dia é o mesmo, o sábado é a exceção —, e depois cada dia ainda se muda sozinho. Nada é escrito antes da última resposta. |

Nos dois caminhos, dia fechado continua fechado: abrir a semana toda por engano
seria o tipo de estrago que o bot não pode fazer com uma tecla.
| `editar_dia_semana` | Abre, fecha, almoço e "fechar neste dia da semana". Num dia fechado só existe "abrir", e abrir copia o expediente de um dia que já abre. |
| `mudar_abertura` / `mudar_fechamento` / `mudar_almoco` → `almoco_ate` | Aceitam a hora como o cliente já dizia (`18:00`, `seis da tarde`). Tirar o almoço é a opção `0`, porque não é uma hora — e ela só aparece nos dias que têm almoço. |
| `horario_invalido` | Abrir depois de fechar não é horário, é engano. Nada é salvo — e com a semana inteira como alvo, um dia que não fecha derruba a mudança toda, porque salvar em cinco e pular o sexto em silêncio é pior do que recusar. |
| `dias_fechados` | As datas de hoje para a frente. Escolher uma abre de novo; a última linha fecha um dia novo. |
| `pedir_dia_fechado` | Lê a data como o resto do bot (`25/12`, `sexta`, `amanhã`). |
| `dia_tem_gente` | Um dia com horário marcado não fecha. O bot mostra quem está marcado e manda cancelar ou remarcar antes — falar com essas pessoas não é trabalho de bot. |

Na conversa o expediente é abre, fecha e almoço, que é como uma pessoa descreve
o próprio dia. No dado continuam sendo intervalos, porque é assim que a
subtração de `slots.ts` funciona e porque o almoço não é regra em lugar nenhum:
ele é o buraco entre dois intervalos. `expedienteOf()` e `intervalsOf()` fazem a
tradução, nos dois sentidos.

```
{ kind: "hours", weekday, intervals }
{ kind: "close_day", day }   { kind: "open_day", day }
```

Fechar um dia no lado do barbeiro faz o dia sumir da lista do cliente no turno
seguinte — é a mesma conta de sempre em `slots.ts`, lendo um `shop` que agora
vem do banco.

## O relatório

| opção | período |
| --- | --- |
| 1 | hoje |
| 2 | esta semana, de segunda a domingo |
| 3 | este mês, do dia 1 ao último |
| 4 | um dia qualquer, por `pedir_dia` |

O relatório soma as comandas do período: o faturado (partido entre serviços e
produtos), quantos atendimentos, o que saiu por serviço e por produto, quanto
entrou por forma de pagamento e quantos faltaram. O bloco de produtos só aparece
quando saiu algum.
Ele nunca lê a tabela de preços — o preço já está copiado dentro de cada
comanda, e é isso que faz um aumento em outubro não reescrever agosto.

## O que o fluxo não faz

- Não entende texto livre, com uma exceção: a hora em `escolher_hora`. Quem
  escreve "quero cortar o cabelo amanhã" recebe o menu de novo, e depois de três
  tentativas fala com o barbeiro.
- Não escolhe profissional. A barbearia tem uma agenda só.
- Não manda lembrete véspera. Isso depende de alguém rodando fora da conversa,
  o que é trabalho da integração.
- O barbeiro não marca nem cancela horário pela conversa dele. Ele lê a agenda e
  fecha comanda; mexer na agenda continua sendo do lado do cliente.
