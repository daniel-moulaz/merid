-- ---------------------------------------------------------------------------
-- schedule_blocks
--
-- ScheduleBlock = QUANDO pretendo executar uma tarefa.
--
-- É a outra metade da proposta do produto, e é uma entidade SEPARADA de Task:
--
--   Task           "preciso fazer isso"          existe sem horário
--   ScheduleBlock  "planejo fazer neste intervalo"
--
-- Uma Task pode ter zero, um ou vários blocos (1:N — ver R1 em PRODUCT.md).
-- Remover um bloco NÃO apaga a tarefa: a tarefa volta a ser "não agendada".
--
-- Intervalo SEMIABERTO [starts_at, ends_at): 14:00-15:00 e 15:00-16:00 não
-- conflitam. Ver R5 em PRODUCT.md.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Pré-requisito da FK composta abaixo.
--
-- `id` já é a chave primária, então esta UNIQUE é logicamente redundante — ela
-- existe só para dar à FK composta um alvo referenciável. É o preço (um índice)
-- de conseguir a garantia da próxima seção.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add constraint tasks_id_user_id_key unique (id, user_id);

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),

  -- Mesmo padrão de `tasks`: o dono NUNCA vem do formulário. O `default` grava
  -- o usuário do JWT e a policy de INSERT recusa qualquer outro valor.
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  task_id uuid not null,

  -- INSTANTES, não datas civis. `due_date` da tarefa é um dia do calendário;
  -- estes dois são momentos exatos no tempo. Semânticas diferentes de propósito.
  starts_at timestamptz not null,
  ends_at timestamptz not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- -------------------------------------------------------------------------
  -- A garantia central: o bloco só pode apontar para tarefa DO MESMO DONO.
  --
  -- Uma policy com `exists (select 1 from tasks ...)` também recusaria o
  -- INSERT, mas seria verificada apenas na escrita e dependeria de o RLS estar
  -- correto. A FK composta é estruturalmente mais forte:
  --
  --   • vale para toda linha existente, para sempre, não só na escrita;
  --   • independe de RLS, de `security definer` e de qualquer código;
  --   • é declarativa e o planejador a usa;
  --   • combinada com `with check (auth.uid() = user_id)`, fecha o ciclo:
  --     se user_id é obrigatoriamente o do JWT, e (task_id, user_id) precisa
  --     existir em tasks, então task_id é necessariamente uma tarefa própria.
  --
  -- `on delete cascade`: excluir DEFINITIVAMENTE uma tarefa leva junto seus
  -- blocos — o planejamento de uma tarefa que não existe mais não significa
  -- nada. Isso é diferente de "Remover da agenda", que apaga só o bloco.
  -- -------------------------------------------------------------------------
  constraint schedule_blocks_task_belongs_to_owner
    foreign key (task_id, user_id)
    references public.tasks (id, user_id)
    on delete cascade,

  -- Duração positiva. Intervalo semiaberto: fim igual ao início é vazio, não
  -- é um bloco.
  constraint schedule_blocks_ends_after_starts
    check (ends_at > starts_at),

  -- Um bloco é uma sessão de trabalho, não um período de férias. O teto evita
  -- que um erro de digitação produza um bloco que domina a timeline inteira.
  -- Cobre o caso legítimo de atravessar a meia-noite (23:00 -> 01:00).
  constraint schedule_blocks_max_duration
    check (ends_at <= starts_at + interval '24 hours')
);

comment on table public.schedule_blocks is
  'Alocação temporal de uma tarefa. Apagar um bloco não apaga a tarefa.';
comment on column public.schedule_blocks.starts_at is
  'Instante de início. Não confundir com tasks.due_date, que é uma data civil.';
comment on column public.schedule_blocks.ends_at is
  'Instante de fim, EXCLUSIVO: [starts_at, ends_at). Blocos encostados não conflitam.';

-- ---------------------------------------------------------------------------
-- Índices
--
-- Duas consultas sustentam a tela Hoje, ambas já filtradas por dono pelo RLS:
--
--   1. blocos que INTERSECTAM um dia:
--        starts_at < fim_do_dia and ends_at > início_do_dia
--   2. tarefas com bloco de hoje em diante (define "não agendada"):
--        ends_at >= início_de_hoje
--
-- O terceiro índice cobre a FK composta: sem ele, o cascade de exclusão de uma
-- tarefa faria varredura completa da tabela.
-- ---------------------------------------------------------------------------

create index schedule_blocks_user_id_starts_at_idx
  on public.schedule_blocks (user_id, starts_at);

create index schedule_blocks_user_id_ends_at_idx
  on public.schedule_blocks (user_id, ends_at);

create index schedule_blocks_task_id_user_id_idx
  on public.schedule_blocks (task_id, user_id);

create trigger schedule_blocks_set_updated_at
  before update on public.schedule_blocks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — as quatro operações, como em `tasks`.
--
-- `(select auth.uid())` em vez de `auth.uid()`: o Postgres avalia a subconsulta
-- uma única vez (InitPlan) em vez de por linha.
--
-- A policy garante o DONO DO BLOCO. Quem garante que a TAREFA referenciada é do
-- mesmo dono é a FK composta acima — não é preciso repetir a verificação aqui.
-- ---------------------------------------------------------------------------

alter table public.schedule_blocks enable row level security;

create policy schedule_blocks_select_own
  on public.schedule_blocks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy schedule_blocks_insert_own
  on public.schedule_blocks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy schedule_blocks_update_own
  on public.schedule_blocks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy schedule_blocks_delete_own
  on public.schedule_blocks for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.schedule_blocks from anon;
grant select, insert, update, delete on public.schedule_blocks to authenticated;
