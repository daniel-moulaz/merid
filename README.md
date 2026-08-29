# Dayflow

> Nome provisório — o código não depende dele.

Um aplicativo de produtividade que une **tarefas** e **agenda**, mantendo as duas
coisas separadas:

> Uma tarefa representa algo que preciso fazer.
> Um bloco na agenda representa quando pretendo realmente executar essa tarefa.

Listas de tarefas mostram o que você tem para fazer. Elas não mostram se aquilo
**cabe no seu dia**. Aqui toda tarefa tem duração estimada, e agendá-la é criar
um bloco de tempo — sem recriar a tarefa e sem confundir **prazo** ("até sexta")
com **horário** ("quarta, 14h–16h").

## Começando

Requisitos: Node 20+ e Docker.

```bash
cp .env.example .env
npm install
npm run db:up        # Postgres 17 em container
npm run db:migrate
npm run db:seed
npm run dev          # http://localhost:3000
```

## Estado atual

Funciona: **Inbox** completa — criar, editar, concluir e reabrir tarefas com
duração, prazo e prioridade, com persistência real.

Modelado no banco mas ainda sem tela: blocos de agenda, projetos e lembretes.

Próximo: agendar uma tarefa em um horário e a visão **Hoje**.

## Documentação

- [docs/PRODUCT.md](docs/PRODUCT.md) — proposta, princípios, regras de domínio,
  fórmula de consistência, escopo do MVP e não objetivos.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, estrutura, modelagem,
  **estratégia de datas/timezone** e decisões técnicas.

## Scripts

| Script              | O que faz                              |
| ------------------- | -------------------------------------- |
| `npm run dev`       | servidor de desenvolvimento            |
| `npm run build`     | build de produção                      |
| `npm run lint`      | ESLint                                 |
| `npm run typecheck` | `tsc --noEmit`                         |
| `npm test`          | testes unitários (sem banco)           |
| `npm run test:db`   | testes de integração (Postgres real)   |
| `npm run test:all`  | as duas suítes                         |
| `npm run db:studio` | Prisma Studio                          |
