# Arquitetura

Complementa [PRODUCT.md](./PRODUCT.md), que define **o que** o produto faz.
Aqui está **como**. O histórico da fundação anterior (Next.js + Prisma) e o que
foi aproveitado dela estão em [MIGRATION.md](./MIGRATION.md).

## Stack

Um único projeto Expo roda em **Android, iOS e Web** a partir da mesma base.

| Camada          | Escolha                              | Versão   |
| --------------- | ------------------------------------ | -------- |
| App             | Expo (SDK) + React Native            | 57.0.18 / 0.86.3 |
| Web             | react-native-web                     | 0.21     |
| Rotas           | Expo Router (file-based, universal)  | 57.0.17  |
| UI              | React                                | 19.2.3   |
| Linguagem       | TypeScript `strict`                  | 6.0      |
| Estilo          | `StyleSheet` + tokens centralizados  | —        |
| Backend         | Supabase (Postgres + Auth + PostgREST) | local via CLI 2.116 |
| Autorização     | **RLS no Postgres**                  | —        |
| Estado servidor | TanStack Query                       | 5.102    |
| Validação       | Zod                                  | 4.5      |
| Formulários     | React Hook Form + `@hookform/resolvers` | 7.86  |
| Datas           | date-fns + @date-fns/tz              | 4.x / 1.x |
| Testes          | Jest + jest-expo                     | 29 / 57  |

Sem NativeWind, sem gerenciador de estado global, sem camada de abstração sobre
o cliente do Supabase.

### A consequência arquitetural mais importante

**Não existe servidor próprio.** O aplicativo fala direto com o Postgres via
PostgREST. Isso muda onde as garantias moram:

| Garantia | Onde vive |
| --- | --- |
| Quem pode ler/escrever cada linha | **RLS policies** |
| Quem é o dono de uma linha nova | **`default auth.uid()` + `with check`** |
| Dado válido (duração, título, coerência) | **CHECK constraints** |
| Instante da conclusão | **trigger no banco** |
| Mensagem boa para o usuário | Zod, no cliente |

O Zod no cliente existe para a experiência. Ele **não é a autoridade** — um
cliente modificado simplesmente esbarra no Postgres.

## Estrutura

```
src/
  app/                       rotas (Expo Router) — só composição
    _layout.tsx              providers: QueryClient, Auth, SafeArea, tema
    index.tsx                redireciona para /hoje ou /entrar
    (auth)/                  _layout (guard) · entrar · criar-conta
    (app)/                   _layout (guard: Stack)
      agendar.tsx            folha modal: criar / reagendar bloco
      (tabs)/                _layout (Tabs) · hoje · inbox · conta
  modules/
    auth/
      auth-schemas.ts        Zod: e-mail, senha
      auth-service.ts        signUp / signIn / signOut + tradução de erros
      auth-context.tsx       sessão + limpeza de cache no logout
      ui/auth-form.tsx
    profile/                 perfil e timezone do usuário
    tasks/
      domain/                PURO: tipos, regras, schemas. Sem I/O, sem React.
        task.ts  task-schemas.ts  *.test.ts
      data/
        task-repository.ts   supabase-js: select/insert/update/delete
        task-queries.ts      hooks TanStack Query + atualização otimista
        task-mapper.ts       linha do banco ↔ tipo de domínio
      ui/                    task-form · task-list-item
    schedule/                ← Etapa 2
      domain/                PURO: bloco, sobreposição, política de conflito,
                             modelo da timeline. Sem pixel, sem React.
        schedule-block.ts    tipos, duração, fim sugerido, "não agendadas"
        schedule-schemas.ts  Zod: formulário (civil) e repositório (instantes)
        overlap.ts           intervalo semiaberto [início, fim)
        conflict-policy.ts   detectar · avisar · deixar decidir
        timeline.ts          janela do dia, régua, colunas de sobrepostos
      data/
        schedule-repository.ts  supabase-js; embed traz a tarefa junto
        schedule-queries.ts     hooks TanStack Query
        schedule-keys.ts        chaves de cache (sem imports — evita ciclo)
        schedule-mapper.ts      linha ↔ domínio
      ui/                    day-timeline · schedule-block-card ·
                             schedule-form · block-actions · unscheduled-*
  lib/
    time/                    data civil, timezone, duração  ← núcleo crítico
    supabase.ts              client + storage por plataforma
    database.types.ts        gerado do schema (versionado)
    errors.ts  supabase-errors.ts  validation.ts  query-client.ts
  theme/                     tokens.ts · use-theme.ts
  ui/                        Text · Button · TextField · SegmentedField ·
                             DateField · TimeField · Screen

supabase/
  config.toml
  migrations/                SQL versionado
tests/rls/                   integração contra o Supabase local
docs/                        PRODUCT.md · ARCHITECTURE.md · MIGRATION.md
```

### Camadas dentro de um módulo

Três, sem cerimônia:

- **`domain/`** — puro e testável sem infraestrutura. Não importa Supabase, não
  importa React, não conhece requisição. É o que sobreviveu inteiro à troca de
  stack.
- **`data/`** — repositório (fala com o supabase-js) e hooks de query. **Não há
  interface de repositório**: uma abstração sobre o cliente só se paga quando
  existe um segundo adaptador, e não existe.
- **`ui/`** — componentes da feature.

Fluxo de uma escrita:

```
Componente (React Native)
  → mutation do TanStack Query      atualização otimista imediata
    → repositório (supabase-js)     valida com Zod, envia sem user_id
      → PostgREST → Postgres
         ├─ RLS decide se pode
         ├─ CHECK decide se é válido
         └─ trigger carimba completed_at
  ← Task de volta → cache reconciliado
```

## Modelo de dados

Apenas duas tabelas nesta etapa.

```
auth.users (Supabase)
   ├─1:1─ public.profiles     display_name, time_zone (IANA)
   └─1:N─ public.tasks        title, estimated_minutes, priority,
                              due_date (date), status, completed_at
```

`schedule_blocks` entra na Etapa 2:

```
auth.users (Supabase)
   ├─1:1─ public.profiles          display_name, time_zone (IANA)
   ├─1:N─ public.tasks             title, estimated_minutes, priority,
   │                               due_date (date), status, completed_at
   └─1:N─ public.schedule_blocks   task_id, starts_at, ends_at (timestamptz)
                                   └─ N:1 ─> tasks
```

`tasks` continua **sem coluna de horário** — é essa ausência que mantém honesta
a separação entre "o que fazer" e "quando fazer". Uma tarefa com zero blocos é
uma tarefa não agendada; uma tarefa pode ter vários blocos (sessões).

#### A garantia mais importante de `schedule_blocks`

Um bloco não pode apontar para tarefa de outro usuário. Isso é sustentado por
uma **FK composta**, não por policy:

```sql
alter table public.tasks add constraint tasks_id_user_id_key unique (id, user_id);

constraint schedule_blocks_task_belongs_to_owner
  foreign key (task_id, user_id) references public.tasks (id, user_id)
  on delete cascade
```

Por que FK composta e não `exists (select 1 from tasks ...)` na policy:

| | policy com subconsulta | FK composta |
| --- | --- | --- |
| Quando é verificada | só na escrita | sempre, para toda linha |
| Depende do RLS estar correto | sim | não |
| Custo | subconsulta por escrita | índice |
| Vale sob `security definer` | não | sim |

Combinada com `user_id default auth.uid()` + `with check`, ela fecha o ciclo:
se `user_id` é obrigatoriamente o do JWT, e `(task_id, user_id)` precisa existir
em `tasks`, então `task_id` é necessariamente uma tarefa própria.

O `on delete cascade` também define o comportamento de exclusão: apagar
**definitivamente** uma tarefa leva seus blocos junto — planejamento de tarefa
que não existe mais não significa nada. Isso é diferente de *"Remover da
agenda"*, que faz `DELETE` só no bloco e devolve a tarefa para as não
agendadas.

### Invariantes aplicadas no banco

Cada uma tem teste em `tests/rls/`:

| Constraint / mecanismo | Garante |
| --- | --- |
| `tasks_title_not_blank` | título não vazio nem só espaços |
| `tasks_title_max_length` | até 200 caracteres |
| `tasks_description_max_length` | até 2000 caracteres |
| `tasks_estimated_minutes_range` | duração entre 1 e 1440 minutos |
| `tasks_status_matches_completed_at` | `status = DONE` ⟺ `completed_at IS NOT NULL` |
| `user_id default auth.uid()` | dono vem do JWT, nunca do formulário |
| trigger `tasks_sync_completed_at` | instante da conclusão vem do servidor |
| trigger `on_auth_user_created` | perfil criado junto com a conta |
| `schedule_blocks_ends_after_starts` | duração positiva (`ends_at > starts_at`) |
| `schedule_blocks_max_duration` | bloco não passa de 24 h |
| `schedule_blocks_task_belongs_to_owner` | bloco só aponta para tarefa do próprio dono |
| `on delete cascade` na FK composta | excluir a tarefa apaga seus blocos |

### RLS

`profiles`, `tasks` e `schedule_blocks` têm RLS habilitado, com
`revoke all ... from anon`.

```sql
-- tasks: as quatro operações
using       ((select auth.uid()) = user_id)   -- select, update, delete
with check  ((select auth.uid()) = user_id)   -- insert, update

-- schedule_blocks: idêntico a tasks. Quem garante que a TAREFA referenciada
-- é do mesmo dono é a FK composta, não a policy — não é preciso repetir.

-- profiles: só select e update.
-- A ausência de policy de INSERT/DELETE já nega as duas: quem cria é o
-- trigger, quem apaga é a cascata de auth.users.
```

`(select auth.uid())` em vez de `auth.uid()` direto faz o Postgres avaliar a
subconsulta uma vez (InitPlan) em vez de por linha.

**O cliente não consegue mentir sobre o dono.** `user_id` tem
`default auth.uid()` e o repositório nunca envia esse campo. Mesmo forjando o
payload, a policy de INSERT recusa (`42501`) — há teste para isso.

## A agenda (Etapa 2)

### Contrato de dados da tela Hoje

Três consultas, todas limitadas, nenhuma por item:

| # | Consulta | Para quê |
| --- | --- | --- |
| 1 | blocos que **intersectam** o dia, com a tarefa embutida | a timeline |
| 2 | `task_id` dos blocos terminando de hoje em diante | quem já tem horário |
| 3 | tarefas abertas (já existia) | a lista de não agendadas |

A junção acontece em memória, com a regra vindo do domínio
(`selectUnscheduledTasks`) — nenhuma lógica de composição espalhada pela UI.

O embed do PostgREST evita o N+1 clássico:

```
schedule_blocks?select=…,task:tasks!schedule_blocks_task_belongs_to_owner(…)
```

O filtro de dia é **interseção**, não "começa dentro do dia" — um bloco
23:00 → 01:00 pertence às duas pontas:

```sql
starts_at < fim_do_dia and ends_at > início_do_dia
```

que é exatamente a condição da função pura `overlaps`.

### Quando uma tarefa é "não agendada"

> Tarefa `TODO` **sem nenhum bloco terminando a partir do início de hoje**, no
> fuso do usuário.

Duas decisões embutidas nessa frase:

1. **Bloco no passado não conta como agendamento.** Uma tarefa com bloco ontem
   que continua aberta não foi feita — ela volta a precisar de horário.
2. **A fronteira é o início do dia, não `now()`.** Com granularidade de dia a
   chave de cache é estável em vez de mudar a cada segundo. Um bloco de hoje
   que já passou não é duplicado na lista porque continua visível na timeline
   logo acima.

A regra mora em `schedule-block.ts`. Nenhum componente a reimplementa.

### Conflito é aviso, não bloqueio

Sobreposição pode ser intencional. A política é **detectar, avisar, mostrar
qual bloco conflita e deixar decidir** — `[Voltar]` ou `[Agendar mesmo assim]`.

A decisão mora em `conflict-policy.ts`, em uma constante:

```ts
export const CONFLICT_POLICY = "WARN" as const;   // ALLOW | WARN | BLOCK
```

Trocar para "bloquear" (ou "sugerir outro horário") é uma linha ali, não uma
caça a `if` espalhados. O formulário só executa a decisão que a política
devolveu.

### Blocos sobrepostos na timeline

Blocos que se sobrepõem — direta ou transitivamente — formam um grupo e
**dividem a largura em colunas**; cada bloco recebe a primeira coluna livre
naquele instante. Nenhum bloco fica escondido atrás de outro. É o algoritmo de
calendário clássico, em ~30 linhas puras e testadas (`layoutBlocks`).

Descartados: desenhar um por cima do outro (esconde informação) e deslocar com
sombra (ambíguo com três ou mais).

A posição é sempre exata; só a **altura** tem mínimo (`minBlockHeight`), para
um bloco de 15 min não virar uma faixa ilegível.

### Timeline sem depender da hora do relógio

Tudo é medido em **minutos desde o início do dia do usuário**, não em hora do
relógio. Em dia de mudança de horário de verão o dia tem 1380 ou 1500 minutos,
e um layout baseado na hora abriria (ou comeria) uma hora de altura. Os
**rótulos** continuam sendo a hora do relógio, convertida do instante — a régua
honestamente pula de 01:00 para 03:00 em vez de desalinhar os blocos.

### Seleção de data e hora sem dependência nativa

`DateField` (faixa de dias + campo `AAAA-MM-DD`) e `TimeField` (`HH:MM` +
passos de 15 min) são React Native puro. Motivo: comportamento idêntico em
Android, iOS e Web, funcionam **no Expo Go sem development build**, e no
navegador são campos de verdade — teclado e leitor de tela funcionam sem
gambiarra.

## Datas e timezone

> A parte mais perigosa de um app de agenda. Estratégia preservada
> integralmente da Etapa 1 — o código de `src/lib/time/` atravessou a migração
> **byte a byte**, junto com seus testes.

### As três formas de tempo

| Forma          | Tipo no banco  | Tipo no domínio         | Exemplo                     |
| -------------- | -------------- | ----------------------- | --------------------------- |
| **Instante**   | `timestamptz`  | `Date` (UTC)            | `completed_at`, `created_at` |
| **Data civil** | `date`         | `CalendarDate` (string) | `due_date` → `"2026-09-01"` |
| **Timezone**   | `text`         | `string` IANA           | `"America/Sao_Paulo"`       |

Regras:

1. **Todo instante é `timestamptz`.** O Postgres do Supabase roda em UTC.

2. **`dueDate` nunca é instante.** Prazo é um dia. No domínio ele é a string
   `"YYYY-MM-DD"` (`CalendarDate`), validada de verdade — `"2026-02-30"` é
   rejeitada.

   **Melhoria em relação à Etapa 1:** o PostgREST devolve colunas `date` como
   string `"YYYY-MM-DD"`, que já é exatamente a representação de
   `CalendarDate`. O prazo atravessa a rede sem nunca virar um objeto `Date` —
   some a conversão que o Prisma obrigava, e com ela toda uma classe de bugs de
   "mudou de dia".

3. **A fronteira do dia é do usuário.** `profiles.time_zone` é a fonte de
   verdade; `useToday()` deriva o dia a partir dela. O relógio do dispositivo
   nunca decide que dia é hoje.

4. **Intervalos são semiabertos `[início, fim)`.** Nunca comparar com
   `23:59:59` — perde eventos e quebra em dia de horário de verão.

5. **Horário de verão é tratado, não evitado.** Um dia pode ter 23 ou 25 horas,
   e a meia-noite local pode não existir. `startOfDayInTimeZone` devolve o
   primeiro instante que existe naquele dia. Há testes para os três casos.

6. **A conclusão é carimbada pelo servidor.** Se o cliente enviasse o instante,
   um relógio errado no aparelho jogaria a tarefa para outro dia — e o dia é a
   unidade das métricas de consistência.

**A suíte unitária roda em `TZ=Pacific/Kiritimati` (UTC+14)** de propósito:
qualquer código que dependa acidentalmente do relógio da máquina falha no
teste, não em produção.

### Risco conhecido: `Intl` no Hermes

Toda a camada depende de `Intl.DateTimeFormat` aceitar timezone IANA e expor
`formatToParts`. Isso é garantido em navegadores e no Node; no React Native
depende da build do motor JS (no Android o Hermes usa o ICU do sistema).

Se faltasse, o sintoma seria silencioso e grave. Por isso
`src/lib/time/time-zone-support.ts` faz uma verificação de capacidade na
inicialização e registra erro explícito se o runtime converter errado.
Correção conhecida, se algum aparelho falhar: adicionar os polyfills
`@formatjs/intl-locale` e `@formatjs/intl-datetimeformat` com os dados de
timezone.

## Decisões

### D1 — Expo Router com grupos `(auth)` e `(app)`

Cada grupo tem um `_layout` que redireciona conforme a sessão. É proteção de
**navegação**, não de dados: mesmo contornando o guard, o RLS não devolve linha
nenhuma sem JWT válido.

### D2 — Sessão persistente por plataforma

`AsyncStorage` no nativo, `localStorage` na web (padrão do supabase-js), e um
storage inerte durante a renderização estática do `expo export`. No nativo, um
listener de `AppState` liga e desliga o auto-refresh conforme o app vai para
segundo plano — sem isso a sessão volta expirada.

### D3 — Nenhuma chave secreta no aplicativo

O app usa apenas a chave publicável. **Os testes de RLS também** — de
propósito: se eles passam, é porque as policies funcionam, e não porque o teste
tinha `service_role` para contorná-las. O `expo export` foi verificado: o valor
da chave secreta não está no bundle; só variáveis `EXPO_PUBLIC_*` são embutidas.

### D4 — TanStack Query com atualização otimista

Concluir uma tarefa é a interação mais repetida do app e precisa parecer
instantânea. A previsão local usa a **mesma regra de domínio**
(`taskCompletionFields`) que o trigger aplica no banco, então a tela não pisca
para outro valor quando a resposta chega. `onSettled` sempre reconcilia.

As chaves de cache incluem o id do usuário, e o logout limpa o cache inteiro —
duas barreiras independentes contra dados de uma conta aparecerem em outra.

### D5 — Schemas Zod com tipos de entrada concretos

Nada de `z.preprocess`/`z.coerce`, que deixariam o tipo de entrada como
`unknown` e quebrariam a inferência do React Hook Form. A coerção de string
existia por causa do `FormData` da arquitetura anterior; aqui o formulário já
entrega `number` e `string | null`.

### D6 — `StyleSheet` + tokens, sem NativeWind

Zero configuração extra no Metro, uma coisa a menos para quebrar em upgrade de
SDK. Todos os valores de cor, espaçamento e tipografia vêm de
`src/theme/tokens.ts` — nenhum componente escreve literal.

### D7 — Duas suítes de teste com objetivos diferentes

- `npm test` — **unitário e puro**: domínio, tempo, schemas. Sem rede, sem
  banco, ~2s. É o que roda o tempo todo.
- `npm run test:rls` — **integração** contra o Supabase local. Prova o
  isolamento entre usuários e as invariantes do banco.

O projeto `rls` do Jest não usa o preset do Expo (e ignora o `babel.config.js`
da raiz): são testes Node puro falando HTTP, e o preset resolveria o
supabase-js pela condição de exportação do React Native, trazendo ESM que o
Jest não transforma.

### D8 — `select` nativo trocado por controle segmentado

Comportamento idêntico nas três plataformas e escolha em um toque só.

## Como rodar

Requisitos: Node 20+, Docker (para o Supabase local).

```bash
cp .env.example .env
npm install
npm run db:start          # sobe Postgres + Auth + Studio via Supabase CLI
npm start                 # Metro: escolha web, Android ou iOS
```

| Script | O que faz |
| --- | --- |
| `npm start` | Metro (escolha a plataforma no terminal) |
| `npm run web` / `android` / `ios` | abre direto na plataforma |
| `npm run export:web` | build estático da web em `dist/` |
| `npm run lint` | ESLint (`eslint-config-expo`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | testes unitários (sem banco) |
| `npm run test:rls` | testes de RLS (exige `db:start`) |
| `npm run test:all` | as duas suítes |
| `npm run db:start` / `db:stop` | sobe/derruba o Supabase local |
| `npm run db:reset` | **apaga** o banco local e reaplica as migrations |
| `npm run db:status` | URLs e chaves locais |
| `npm run db:types` | regenera `src/lib/database.types.ts` |

> **Dispositivo físico:** `127.0.0.1` aponta para o próprio aparelho. Troque
> `EXPO_PUBLIC_SUPABASE_URL` pelo IP da máquina na rede local.

## Convenções

- TypeScript `strict` **mais** `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`. Sem `any`, sem
  `@ts-ignore`: se o tipo está atrapalhando, o modelo está errado.
- Regra de negócio nunca mora em estado do React. `useState` só para UI.
- Toda escrita passa pelo repositório; nenhuma tela chama `supabase` direto.
- Migrations versionadas; constraint escrita à mão vai na migration com
  comentário explicando o porquê.
- Nenhum segredo no repositório. `.env` é ignorado, `.env.example` é o contrato.
