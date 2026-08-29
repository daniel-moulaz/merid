# Arquitetura

Complementa [PRODUCT.md](./PRODUCT.md), que define **o que** o produto faz.
Aqui está **como**.

## Stack

| Camada        | Escolha                          | Versão   |
| ------------- | -------------------------------- | -------- |
| Framework     | Next.js (App Router) + Turbopack | 16.3.3   |
| UI            | React                            | 19.2.8   |
| Linguagem     | TypeScript `strict`              | 5.9      |
| Estilo        | Tailwind CSS v4 + shadcn/ui      | 4.x      |
| Banco         | PostgreSQL                       | 17       |
| ORM           | Prisma (driver adapter `pg`)     | 7.10.0   |
| Validação     | Zod                              | 4.5      |
| Datas         | date-fns + @date-fns/tz          | 4.x/1.x  |
| Testes        | Vitest                           | 4.1      |
| E2E (depois)  | Playwright                       | —        |

Monólito modular. Sem microserviços, sem gerenciador de estado global, sem
camadas de abstração especulativas.

## Estrutura

```
src/
  app/                      rotas (App Router) — só composição, sem regra
    inbox/page.tsx
    layout.tsx  page.tsx  error.tsx  manifest.ts  icon.svg
  components/
    ui/                     primitivos shadcn (button, input, label)
    app-shell.tsx  app-nav.tsx
  modules/
    tasks/
      domain/               PURO: tipos, regras, schemas. Sem I/O, sem React.
        task.ts  task-schemas.ts  *.test.ts
      task-service.ts       casos de uso (fala com o Prisma)
      task-actions.ts       Server Actions (fronteira HTTP)
      task-service.integration.ts
      ui/                   componentes da feature
  lib/
    time/                   data civil, timezone, duração  ← núcleo crítico
    auth/session.ts         resolução do usuário (seam para o login real)
    db.ts  errors.ts  action-result.ts  validation.ts  prisma-errors.ts
  generated/prisma/         cliente gerado (não versionado)
prisma/     schema.prisma · migrations/ · seed.ts
scripts/    setup-test-db.mts
docs/       PRODUCT.md · ARCHITECTURE.md
```

### Camadas dentro de um módulo

Três, sem cerimônia:

- **`domain/`** — puro e testável sem infraestrutura. Não importa Prisma, não
  importa React, não conhece requisição.
- **`*-service.ts`** — o caso de uso. Fala com o Prisma diretamente. **Não há
  interface de repositório**: uma abstração sobre o Prisma só se paga quando
  existe um segundo adaptador, e não existe.
- **`*-actions.ts`** — Server Actions. Autentica, valida, chama o serviço,
  revalida cache. Nenhuma regra de negócio.

Fluxo de uma escrita:

```
Componente cliente
  → Server Action        ("use server")
    → requireUser()      sessão do servidor; userId NUNCA vem do cliente
    → parseInput(zod)    validação no servidor
    → service            escrita escopada por userId
    → revalidatePath
  ← ActionResult<T>      { ok: true, data } | { ok: false, error }
```

## Modelo de dados

```
User ──< Task ──< ScheduleBlock
  │       │            │
  │       └──< Reminder >┘        (exatamente um dos dois alvos)
  └──< Project ──< Task
```

| Tabela            | Papel                                                  |
| ----------------- | ------------------------------------------------------ |
| `users`           | dono de tudo; guarda o **timezone IANA**               |
| `projects`        | áreas de organização                                   |
| `tasks`           | o QUE fazer — sem horário                              |
| `schedule_blocks` | o QUANDO — `[starts_at, ends_at)`                      |
| `reminders`       | notificações — modeladas agora, entregues depois       |

Tabelas e colunas em `snake_case`; enums também. O mapeamento fica no
`schema.prisma`, o SQL cru fica legível.

### Invariantes aplicadas no banco

O aplicativo valida para dar boa mensagem. O banco valida porque é a última
linha de defesa — cada uma tem teste de integração:

| Constraint                            | Garante                                                      |
| ------------------------------------- | ------------------------------------------------------------ |
| `tasks_title_not_blank`               | título não vazio nem só espaços                              |
| `tasks_estimated_minutes_range`       | duração entre 1 e 1440 minutos                               |
| `tasks_status_matches_completed_at`   | `status = DONE` ⟺ `completed_at IS NOT NULL`                 |
| `schedule_blocks_positive_duration`   | `ends_at > starts_at`                                        |
| `schedule_blocks_task_id_user_id_fkey`| bloco nunca aponta para tarefa de **outro usuário** (FK composta) |
| `reminders_exactly_one_target`        | lembrete tem alvo: a tarefa **ou** o bloco, nunca ambos      |

A FK composta merece destaque: `schedule_blocks.user_id` é desnormalizado (para
varrer a agenda por usuário e período sem join), e a FK
`(task_id, user_id) → tasks(id, user_id)` torna impossível que ele divirja.

**Exceção conhecida:** `tasks.project_id` usa FK simples, porque uma FK composta
com `ON DELETE SET NULL` seria inválida (`user_id` é obrigatório). A posse do
projeto é verificada no serviço (`assertProjectBelongsToUser`), com teste de
integração cobrindo a tentativa cruzada.

### Ainda não existe

`RecurrenceRule` **não foi criada**. Recorrência gera tarefas (R7), então a
tabela futura referencia `tasks` — nada na modelagem atual atrapalha. Criar uma
tabela vazia hoje seria adivinhação.

## Datas e timezone

> A parte mais perigosa de um app de agenda. Estratégia única, sem exceções.

### As três formas de tempo

| Forma            | Tipo no banco     | Tipo no domínio        | Exemplo                     |
| ---------------- | ----------------- | ---------------------- | --------------------------- |
| **Instante**     | `timestamptz(3)`  | `Date` (UTC)           | `starts_at`, `completed_at` |
| **Data civil**   | `date`            | `CalendarDate` (string)| `due_date` → `"2026-09-01"` |
| **Timezone**     | `text`            | `string` IANA          | `"America/Sao_Paulo"`       |

Regras:

1. **Todo instante é `timestamptz` com precisão de milissegundo.** O container
   do Postgres roda em UTC. Precisão de 3 casas casa com o `Date` do JS e evita
   round-trips que "perdem" microssegundos.

2. **`dueDate` nunca é instante.** Prazo é um dia. No domínio ele é a string
   `"YYYY-MM-DD"` (`CalendarDate`), validada de verdade — `"2026-02-30"` é
   rejeitada. A conversão para `Date` acontece **só** na fronteira do banco
   (`calendarDateToUtcDate` / `utcDateToCalendarDate`), sempre por componentes
   **UTC**. Ler uma coluna `date` com `getFullYear()` (local) é exatamente o bug
   de "a tarefa mudou de dia".

3. **A fronteira do dia é do usuário, não do servidor nem do navegador.**
   `User.timeZone` é a fonte de verdade. "Hoje", os quadrados do heatmap e os
   dias do streak são calculados no servidor com esse timezone. O navegador
   nunca decide que dia é hoje.

4. **Intervalos são semiabertos: `[início, fim)`.** Um dia é
   `[startOfDay(D), startOfDay(D+1))`. Nunca comparar com `23:59:59` — perde
   eventos e quebra em dia de horário de verão. `dayRangeInTimeZone` devolve
   exatamente isso.

5. **Horário de verão é tratado, não evitado.** Um dia pode ter 23 ou 25 horas,
   e a meia-noite local pode não existir (no Chile o relógio pula 00:00 → 01:00).
   `startOfDayInTimeZone` devolve o primeiro instante que existe naquele dia.
   Há testes para os três casos.

O Brasil não usa horário de verão desde 2019 — mas o modelo é multi-usuário
desde o primeiro dia, então a camada de tempo não assume isso em lugar nenhum.

**Suíte de testes roda em `TZ=Pacific/Kiritimati` (UTC+14)** de propósito:
qualquer código que dependa acidentalmente do relógio da máquina falha no
teste, não em produção.

## Decisões

### D1 — Server Actions em vez de rotas de API

Menos código, tipagem ponta a ponta, sem cliente HTTP. A validação Zod acontece
na action, então expor os mesmos casos de uso via REST/tRPC depois (para um app
nativo, por exemplo) é adicionar um handler que chama o mesmo serviço.

### D2 — Autenticação atrás de um seam desde o começo

Não há login ainda, mas `getCurrentUser()` já é o **único** lugar que resolve o
usuário, e todo serviço recebe `SessionUser`. Em desenvolvimento ele resolve por
`DEV_USER_EMAIL`; **em produção retorna `null` por construção**, para que um
deploy com a variável esquecida no ambiente não autentique ninguém. Ligar Auth.js
depois é reescrever o corpo dessa função — nenhum caso de uso muda.

`userId` nunca chega do cliente. Escritas usam `where: { id_userId: {...} }`, o
que verifica posse e escreve na mesma operação (sem janela entre checar e
gravar).

### D3 — `ActionResult` em vez de exceções na fronteira

Erro esperado (validação, não encontrado, sem permissão) vira
`{ ok: false, error }` e chega à UI como mensagem útil. Erro inesperado é logado
no servidor e vira mensagem genérica — nunca vaza stack trace ou SQL.

### D4 — Prisma 7 com driver adapter

Prisma 7 exige adapter (`@prisma/adapter-pg`) e config em `prisma7.config.ts`;
o cliente é gerado em `src/generated/prisma` e **não é versionado** (rode
`npm run db:generate` após clonar).

**A versão do CLI está travada.** A tag `latest` do pacote `prisma` aponta hoje
para `8.0.0-rc.12` (um release candidate), enquanto `@prisma/client` estável é
`7.10.0`. CLI e client precisam casar, então ambos estão fixados em `7.10.0`
com `--save-exact`. Ao atualizar, suba os dois juntos.

> Vulnerabilidade conhecida e aceita: `deepmerge-ts` (via `@prisma/config`,
> **devDependency**) tem um aviso de exaustão de pilha ao mesclar grafos
> recursivos. Afeta a leitura do arquivo de config em tempo de build, não o
> runtime, e não recebe entrada de usuário. `npm audit fix --force` faria
> downgrade para o Prisma 6. Revisar quando o Prisma 8 estabilizar.

### D5 — Identificadores UUIDv7

`@default(uuid(7)) @db.Uuid`. Ordenável por tempo (locality de índice melhor que
UUIDv4) e sem revelar contagem de registros como um `serial`.

### D6 — Testes em duas suítes

- `npm test` — unitário e **puro**: domínio, schemas, camada de tempo. Roda em
  ~0,5s, sem banco, sem rede. É o que roda o tempo todo.
- `npm run test:db` — integração contra um Postgres real, em um banco
  **separado** (`app_test`), que é truncado entre casos. Prova a fatia vertical
  e as invariantes do banco.

Testes que dependem de infraestrutura não podem tornar a suíte principal lenta
ou intermitente; testes que provam persistência não podem ser substituídos por
mock.

### D7 — PWA sem service worker (ainda)

Há `manifest.webmanifest`, ícone e metadados: o app instala e abre em janela
própria. **Não há service worker** — offline e Web Push entram junto com a etapa
de notificações, que é quem realmente precisa deles. Nada na modelagem impede:
`reminders` já existe com fila (`status`, `remind_at`) e índice de disparo.

### D8 — `select` nativo em vez de combobox

No celular abre o seletor do sistema (mais rápido para o caso "criar tarefa em 3
segundos") e funciona com `FormData` sem JavaScript. shadcn/ui entra onde
agrega: `button`, `input`, `label`.

## Como rodar

```bash
cp .env.example .env      # ajuste se precisar
npm install
npm run db:up             # Postgres 17 via Docker (--wait até ficar saudável)
npm run db:migrate        # aplica as migrations
npm run db:seed           # cria o usuário de desenvolvimento + exemplos
npm run dev               # http://localhost:3000
```

| Script                | O que faz                                        |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | servidor de desenvolvimento                      |
| `npm run build`       | build de produção                                |
| `npm run lint`        | ESLint                                           |
| `npm run typecheck`   | `tsc --noEmit`                                   |
| `npm test`            | testes unitários (sem banco)                     |
| `npm run test:db`     | prepara `app_test` e roda a integração           |
| `npm run test:all`    | as duas suítes                                   |
| `npm run db:up/down`  | sobe/derruba o Postgres                          |
| `npm run db:migrate`  | cria e aplica migration                          |
| `npm run db:seed`     | popula dados de desenvolvimento                  |
| `npm run db:studio`   | Prisma Studio                                    |
| `npm run db:reset`    | **apaga** o banco e reaplica tudo                |

> `npm start` (produção) mostra a tela "nenhuma sessão": o atalho de sessão de
> desenvolvimento é desligado quando `NODE_ENV=production`. Isso é intencional
> (D2) e some quando o login real existir.

## Convenções

- TypeScript `strict` **mais** `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`. Sem `any`, sem
  `@ts-ignore`: se o tipo está atrapalhando, o modelo está errado.
- Regra de negócio nunca mora em estado do React. `useState` só para UI
  (formulário aberto, linha em edição).
- Toda entrada do cliente passa por Zod **no servidor**.
- Migrations versionadas; constraint escrita à mão vai na migration com
  comentário explicando o porquê.
- Nenhum segredo no repositório. `.env` é ignorado, `.env.example` é o contrato.
