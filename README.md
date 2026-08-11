# Paulo Santos Bot

Um chatbot de regras para barbearia, em pt-br. Ele responde as perguntas de sempre (preços, horários, endereço) e agenda o horário, por um menu numerado.

São duas conversas no mesmo número. O cliente marca, cancela e remarca. O barbeiro — o telefone que está em `SHOP.barbers` — vê a agenda do dia, fecha a comanda de cada atendimento (quem veio, o que saiu, como pagou) e pede o relatório do dia, da semana ou do mês. Quem está falando é o que decide qual das duas tabelas de estado roda.

O que quebra um chatbot é a conversa, não a integração. Então a primeira casca em volta do motor é um simulador de WhatsApp: uma página estática com um chat só, o bot do outro lado. Dá para repetir o fluxo inteiro quantas vezes for preciso, sem conta, sem telefone e sem custo.

O motor é o produto. O simulador é a bancada de teste, e a API do WhatsApp é mais uma casca em volta do mesmo motor.

## Como rodar

```bash
npm install
npm test
npm run build
npm run serve
```

O simulador fica em `http://localhost:8000`.

## Como funciona

O motor é uma função pura:

```ts
reply(session, texto, ctx) -> { session, messages, effects }
```

O relógio, a agenda e as comandas entram como dado, e as escritas saem como `Effect[]` para a casca aplicar. Quem guarda isso entre um turno e o outro é um `Store`, e `src/store.ts` diz só o que ele precisa saber fazer: o simulador implementa em `localStorage`, e um banco de verdade depois implementa as mesmas quatro operações sem nada acima mudar.

O fluxo é uma tabela de estados — `src/bot/flow.ts` para o cliente, `src/bot/barbeiro.ts` para o barbeiro — e `src/bot/engine.ts` é um interpretador que não sabe o que é barbearia, nem que existe mais de uma conversa.

##### Referências

- `AGENTS.md`: o contrato do repositório.
- `docs/FLUXO.md`: o fluxo, estado por estado.
