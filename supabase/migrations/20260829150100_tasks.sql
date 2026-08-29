-- ---------------------------------------------------------------------------
-- tasks
--
-- Task = O QUE precisa ser feito. NÃO tem horário.
-- Quando a tarefa será executada é papel do ScheduleBlock (Etapa 2).
--
-- Duas colunas de tempo com semânticas diferentes de propósito:
--   due_date     `date`        — prazo: "preciso terminar até sexta". Dia civil.
--   completed_at `timestamptz` — instante em que foi concluída.
-- Nunca tratar `due_date` como início de execução.
-- ---------------------------------------------------------------------------

create type public.task_status as enum ('TODO', 'DONE');

-- A ordem do enum importa: `order by priority desc` traz URGENT primeiro.
create type public.task_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),

  -- `default auth.uid()` + a policy de INSERT abaixo tornam impossível gravar
  -- uma tarefa em nome de outro usuário, mesmo que o cliente forje o payload.
  -- O dono NUNCA vem do formulário.
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  title text not null,
  description text,

  -- Duração é pilar do produto: obrigatória, nunca nula.
  estimated_minutes integer not null,

  priority public.task_priority not null default 'MEDIUM',

  due_date date,

  status public.task_status not null default 'TODO',
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Invariantes portadas da Etapa 1. O banco é a última linha de defesa:
  -- sem servidor próprio nesta arquitetura, é AQUI que a regra é garantida.
  constraint tasks_title_not_blank
    check (length(btrim(title)) > 0),

  constraint tasks_title_max_length
    check (length(title) <= 200),

  constraint tasks_description_max_length
    check (description is null or length(description) <= 2000),

  constraint tasks_estimated_minutes_range
    check (estimated_minutes between 1 and 1440),

  -- status e completed_at nunca podem divergir.
  constraint tasks_status_matches_completed_at
    check ((status = 'DONE') = (completed_at is not null))
);

comment on table public.tasks is
  'Tarefas do usuário. Sem horário: agendamento é responsabilidade da Etapa 2.';
comment on column public.tasks.due_date is
  'Prazo como data civil (sem horário e sem timezone). Não é horário de início.';
comment on column public.tasks.estimated_minutes is
  'Estimativa de esforço. Não confundir com a duração alocada na agenda.';

-- ---------------------------------------------------------------------------
-- Índices
--
-- A consulta da Inbox é "minhas tarefas abertas, mais importantes primeiro".
-- O índice cobre o filtro da policy (user_id) junto com o filtro da query.
-- ---------------------------------------------------------------------------

create index tasks_user_id_status_created_at_idx
  on public.tasks (user_id, status, created_at desc);

create index tasks_user_id_due_date_idx
  on public.tasks (user_id, due_date)
  where due_date is not null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — as quatro operações, sempre
--
-- `(select auth.uid())` em vez de `auth.uid()` direto: o Postgres avalia a
-- subconsulta uma única vez (InitPlan) em vez de por linha.
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;

create policy tasks_select_own
  on public.tasks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy tasks_insert_own
  on public.tasks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy tasks_update_own
  on public.tasks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy tasks_delete_own
  on public.tasks for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.tasks from anon;
grant select, insert, update, delete on public.tasks to authenticated;

-- ---------------------------------------------------------------------------
-- completed_at é responsabilidade do servidor
--
-- O cliente envia apenas o `status`. Se ele também enviasse o instante da
-- conclusão, um relógio errado no aparelho colocaria a tarefa no dia errado —
-- e o dia é justamente a unidade das métricas de consistência do produto.
--
-- O aplicativo continua conhecendo a regra (para atualizar a tela na hora),
-- mas quem decide o valor gravado é o Postgres.
-- ---------------------------------------------------------------------------

create or replace function public.sync_task_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Em INSERT o registro `old` não existe: acessá-lo levanta erro no PL/pgSQL.
  if tg_op = 'INSERT' then
    new.completed_at = case when new.status = 'DONE' then now() else null end;
    return new;
  end if;

  if new.status = 'DONE' and old.status is distinct from 'DONE' then
    new.completed_at = now();
  elsif new.status = 'TODO' then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

create trigger tasks_sync_completed_at
  before insert or update of status on public.tasks
  for each row execute function public.sync_task_completed_at();
