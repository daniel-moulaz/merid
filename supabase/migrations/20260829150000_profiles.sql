-- ---------------------------------------------------------------------------
-- profiles
--
-- Dados do usuário que o `auth.users` não guarda. O campo mais importante é o
-- `time_zone`: ele é a ÚNICA fonte de verdade para fronteiras de dia (hoje,
-- heatmap, streak). Nunca derivar o dia do relógio do dispositivo.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  display_name text,

  -- Timezone IANA, ex.: "America/Sao_Paulo".
  time_zone text not null default 'America/Sao_Paulo',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_time_zone_not_blank check (length(btrim(time_zone)) > 0),
  constraint profiles_display_name_not_blank check (
    display_name is null or length(btrim(display_name)) > 0
  )
);

comment on table public.profiles is
  'Perfil do usuário. `time_zone` define as fronteiras de dia do produto.';

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Criação automática do perfil no cadastro
--
-- `security definer` porque roda no contexto do `auth.users`, onde o usuário
-- recém-criado ainda não tem privilégio para inserir. `search_path = ''` evita
-- sequestro de resolução de nomes — obrigatório em função definer.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, time_zone)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'time_zone', '')), ''),
      'America/Sao_Paulo'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
--
-- O perfil não é criado nem apagado pelo cliente: quem cria é o trigger, quem
-- apaga é a cascata do `auth.users`. Por isso existem apenas policies de
-- SELECT e UPDATE — a ausência de policy já nega INSERT e DELETE.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;
