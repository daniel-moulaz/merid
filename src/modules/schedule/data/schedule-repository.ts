import { supabase } from "@/lib/supabase";
import { mapPostgrestError, unwrap } from "@/lib/supabase-errors";
import type { InstantRange } from "@/lib/time";
import { parseInput } from "@/lib/validation";

import type { ScheduleBlock, ScheduleBlockWithTask } from "../domain/schedule-block";
import {
  createScheduleBlockInputSchema,
  updateScheduleBlockInputSchema,
  type CreateScheduleBlockInput,
  type UpdateScheduleBlockInput,
} from "../domain/schedule-schemas";
import {
  createInputToInsert,
  rowToScheduleBlock,
  rowToScheduleBlockWithTask,
  SCHEDULE_BLOCK_COLUMNS,
  SCHEDULE_BLOCK_WITH_TASK_COLUMNS,
  updateInputToUpdate,
} from "./schedule-mapper";

/**
 * Acesso a dados da agenda.
 *
 * Como em `tasks`, nenhuma função recebe ou envia `user_id`: o isolamento é do
 * RLS. E aqui há uma garantia a mais — a FK composta
 * `(task_id, user_id) -> tasks (id, user_id)` torna impossível criar um bloco
 * apontando para tarefa de outro usuário, mesmo com o payload adulterado.
 */

/**
 * Blocos que INTERSECTAM um intervalo, com a tarefa de cada um.
 *
 * Serve tanto o dia quanto a semana: o que muda é só o intervalo recebido, e é
 * por isso que a visão semanal não precisou de sete consultas nem de uma
 * consulta nova.
 *
 * Interseção e não "começa dentro do intervalo": um bloco 23:00 → 01:00
 * pertence às duas pontas e precisa aparecer nas duas. A condição é exatamente
 * a mesma da função pura `overlaps`:
 *
 *     starts_at < fim_do_intervalo  AND  ends_at > início_do_intervalo
 *
 * Uma consulta só, com a tarefa embutida — sem N+1.
 */
const BLOCKS_IN_RANGE_LIMIT = 500;

export async function fetchBlocksInRange(range: InstantRange): Promise<ScheduleBlockWithTask[]> {
  const rows = unwrap(
    await supabase
      .from("schedule_blocks")
      .select(SCHEDULE_BLOCK_WITH_TASK_COLUMNS)
      .lt("starts_at", range.endExclusive.toISOString())
      .gt("ends_at", range.start.toISOString())
      .order("starts_at", { ascending: true })
      // Teto explícito pela mesma razão de `fetchOpenTasks`: o corte do
      // PostgREST é silencioso. Uma semana com 500 blocos não existe.
      .limit(BLOCKS_IN_RANGE_LIMIT),
  );

  return rows.map(rowToScheduleBlockWithTask);
}

/**
 * Teto de segurança da consulta de ids agendados. Uma agenda pessoal não chega
 * perto disso; o limite existe para que um dado inesperado não vire uma
 * resposta gigante.
 */
const SCHEDULED_TASK_IDS_LIMIT = 1000;

/**
 * Ids das tarefas com bloco terminando a partir de `boundary` (o início de
 * hoje no fuso do usuário).
 *
 * É o complemento da lista de "não agendadas" — ver `selectUnscheduledTasks`.
 * Traz só a coluna `task_id`: a carga é mínima e substitui uma consulta por
 * tarefa.
 */
export async function fetchScheduledTaskIds(boundary: Date): Promise<string[]> {
  const rows = unwrap(
    await supabase
      .from("schedule_blocks")
      .select("task_id")
      .gte("ends_at", boundary.toISOString())
      .limit(SCHEDULED_TASK_IDS_LIMIT),
  );

  return rows.map((row) => row.task_id);
}

/**
 * Um bloco pelo id.
 *
 * Necessário porque a tela de reagendamento pode ser aberta direto por URL na
 * web, sem a agenda do dia em cache. O RLS resolve a autorização: o id de
 * outro usuário simplesmente não encontra linha.
 */
export async function fetchScheduleBlock(id: string): Promise<ScheduleBlock> {
  const row = unwrap(
    await supabase
      .from("schedule_blocks")
      .select(SCHEDULE_BLOCK_COLUMNS)
      .eq("id", id)
      .single(),
  );

  return rowToScheduleBlock(row);
}

export async function createScheduleBlock(
  input: CreateScheduleBlockInput,
): Promise<ScheduleBlock> {
  const parsed = parseInput(createScheduleBlockInputSchema, input);

  const row = unwrap(
    await supabase
      .from("schedule_blocks")
      .insert(createInputToInsert(parsed))
      .select(SCHEDULE_BLOCK_COLUMNS)
      .single(),
  );

  return rowToScheduleBlock(row);
}

/** Reagendar e editar horário são a mesma operação: UPDATE do bloco. */
export async function updateScheduleBlock(
  input: UpdateScheduleBlockInput,
): Promise<ScheduleBlock> {
  const parsed = parseInput(updateScheduleBlockInputSchema, input);

  const row = unwrap(
    await supabase
      .from("schedule_blocks")
      .update(updateInputToUpdate(parsed))
      .eq("id", parsed.id)
      .select(SCHEDULE_BLOCK_COLUMNS)
      .single(),
  );

  return rowToScheduleBlock(row);
}

/**
 * "Remover da agenda": apaga APENAS o bloco.
 *
 * A tarefa continua existindo e aberta — ela volta para a lista de não
 * agendadas. Esta função nunca toca na tabela `tasks`.
 */
export async function deleteScheduleBlock(id: string): Promise<void> {
  const { error } = await supabase.from("schedule_blocks").delete().eq("id", id);
  if (error !== null) throw mapPostgrestError(error);
}
