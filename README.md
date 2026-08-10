# Paulo Santos Bot

Um chatbot de regras para barbearia, em pt-br. Ele responde as perguntas de sempre (preços, horários, endereço) e agenda o horário, por um menu numerado.

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

O relógio e a agenda entram como dado, e as escritas na agenda saem como `Effect[]` para a casca aplicar. Por isso o simulador (agenda no `localStorage`) e uma futura integração (agenda num banco) rodam o mesmo código.

O fluxo é uma tabela de estados em `src/bot/flow.ts`, e `src/bot/engine.ts` é um interpretador que não sabe o que é barbearia.

##### Referências

- `AGENTS.md`: o contrato do repositório.
- `docs/FLUXO.md`: o fluxo, estado por estado.
