-- ---------------------------------------------------------------------------
-- daily_activity — atividade concluída, agregada por dia civil do usuário.
--
-- Nenhuma coluna nova: a Etapa 1 já grava `completed_at` por trigger, com um
-- CHECK que impede `status`/`completed_at` divergirem. Esta migration só
-- acrescenta a LEITURA agregada que a tela Progresso precisa.
--
-- ## Por que agregar no banco em vez de somar no cliente
--
-- O PostgREST desta instalação corta respostas em 1000 linhas
-- (`config.toml: max_rows`). Buscar as tarefas concluídas cruas para somar no
-- aplicativo passaria desse teto por volta do primeiro ano de uso moderado —
-- e o corte é SILENCIOSO: o heatmap e a melhor sequência ficariam errados sem
-- nada indicar. Agrupando por dia, a resposta tem no máximo uma linha por dia
-- do intervalo (366 em um ano), então o teto deixa de existir na prática.
--
-- ## Por que o intervalo chega em timestamptz e o fuso separado
--
-- O recorte usa `completed_at` direto, sem função em volta da coluna — é isso
-- que mantém o filtro utilizável por índice. Quem converte as datas civis do
-- heatmap nesses dois instantes é o cliente, com a mesma camada de tempo que o
-- resto do produto usa, então não existe uma segunda definição de "início do
-- dia" vivendo no SQL.
--
-- O fuso continua sendo necessário para decidir a QUAL dia cada conclusão
-- pertence. `at time zone` usa a tzdata do Postgres, então uma conclusão às
-- 23:30 em São Paulo cai no dia local correto mesmo já sendo outro dia em UTC,
-- e dias de transição de horário de verão não deslocam nada.
-- ---------------------------------------------------------------------------

create or replace function public.daily_activity(
  p_from timestamptz,
  p_to timestamptz,
  p_time_zone text
)
returns table (
  day date,
  minutes integer,
  tasks integer
)
language sql
stable
-- `security invoker` (o padrão, explícito aqui porque é a linha que importa):
-- a função roda com os privilégios de quem chama, então a RLS de `tasks`
-- continua sendo a autorização. Ninguém agrega o histórico de outra pessoa.
security invoker
set search_path = ''
as $$
  select
    (t.completed_at at time zone p_time_zone)::date,
    sum(t.estimated_minutes)::integer,
    count(*)::integer
  from public.tasks as t
  where t.status = 'DONE'
    and t.completed_at >= p_from
    and t.completed_at < p_to
  group by 1
  order by 1;
$$;

comment on function public.daily_activity is
  'Minutos estimados e contagem de tarefas concluídas por dia civil, no fuso informado. Intervalo semiaberto [p_from, p_to).';

-- `execute` é concedido a `public` por padrão: revogar primeiro é o que
-- garante que a função não fique acessível à role anônima.
revoke all on function public.daily_activity(timestamptz, timestamptz, text) from public;
revoke all on function public.daily_activity(timestamptz, timestamptz, text) from anon;
grant execute on function public.daily_activity(timestamptz, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Índice: deliberadamente NENHUM novo.
--
-- `tasks_user_id_status_created_at_idx` já cobre (user_id, status), que é onde
-- está quase toda a seletividade — a RLS restringe a um usuário e o filtro
-- pega só as concluídas. Um índice em `completed_at` só passaria a valer com
-- um histórico grande dentro de UMA conta, e aí a decisão terá números reais
-- para se apoiar em vez de suposição.
-- ---------------------------------------------------------------------------
