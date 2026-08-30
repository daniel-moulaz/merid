import { supabase } from "@/lib/supabase";
import { unwrap } from "@/lib/supabase-errors";
import { assertCalendarDate, type InstantRange } from "@/lib/time";

import type { DayActivity } from "../domain/activity";

/**
 * Acesso a dados do progresso.
 *
 * Uma chamada só, e o agrupamento por dia acontece no Postgres. O motivo está
 * na migration `20260830120000_daily_activity.sql`: o PostgREST corta respostas
 * em 1000 linhas, então somar tarefas cruas no aplicativo passaria a mentir
 * silenciosamente depois de algumas centenas de conclusões.
 *
 * Como em `tasks` e `schedule_blocks`, nenhum `user_id` trafega: a função é
 * `security invoker`, então quem autoriza continua sendo a RLS da tabela.
 */
export async function fetchDailyActivity(
  range: InstantRange,
  timeZone: string,
): Promise<DayActivity[]> {
  const rows = unwrap(
    await supabase.rpc("daily_activity", {
      p_from: range.start.toISOString(),
      p_to: range.endExclusive.toISOString(),
      p_time_zone: timeZone,
    }),
  );

  return rows.map((row) => ({
    // A coluna é `date` no Postgres, e o PostgREST a entrega como
    // "AAAA-MM-DD" — exatamente a representação de `CalendarDate`. O dia
    // atravessa a rede sem nunca virar `Date`, que é o que elimina a classe
    // inteira de bugs de "mudou de dia na desserialização".
    date: assertCalendarDate(row.day),
    minutes: row.minutes,
    tasks: row.tasks,
  }));
}
