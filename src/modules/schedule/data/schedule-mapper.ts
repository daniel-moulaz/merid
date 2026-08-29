import type { Database } from "@/lib/database.types";
import { rowToTask, TASK_COLUMNS } from "@/modules/tasks/data/task-mapper";

import type { ScheduleBlock, ScheduleBlockWithTask } from "../domain/schedule-block";
import type {
  CreateScheduleBlockInput,
  UpdateScheduleBlockInput,
} from "../domain/schedule-schemas";

/**
 * Fronteira entre a linha do banco e o tipo de domínio.
 *
 * Diferença importante em relação a `tasks`: `starts_at` e `ends_at` são
 * `timestamptz` e chegam como string ISO com offset — viram `Date` (instantes)
 * aqui. Já `due_date` da tarefa continua atravessando como `CalendarDate`, sem
 * nunca virar `Date`. As duas semânticas convivem sem se contaminar.
 */

type ScheduleBlockRow = Pick<
  Database["public"]["Tables"]["schedule_blocks"]["Row"],
  "id" | "task_id" | "starts_at" | "ends_at" | "created_at" | "updated_at"
>;

type ScheduleBlockInsert = Database["public"]["Tables"]["schedule_blocks"]["Insert"];
type ScheduleBlockUpdate = Database["public"]["Tables"]["schedule_blocks"]["Update"];

/** Colunas do bloco. `user_id` não é buscado: o RLS já filtrou por dono. */
export const SCHEDULE_BLOCK_COLUMNS =
  "id, task_id, starts_at, ends_at, created_at, updated_at";

/**
 * Bloco + tarefa em UMA consulta.
 *
 * O embed do PostgREST resolve a tarefa pela chave estrangeira, o que evita o
 * N+1 clássico de "buscar os blocos e depois a tarefa de cada um". O nome da
 * constraint aparece explicitamente porque a FK é composta
 * `(task_id, user_id) -> tasks (id, user_id)`: dizer qual relacionamento usar
 * remove qualquer ambiguidade na resolução.
 */
export const SCHEDULE_BLOCK_WITH_TASK_COLUMNS =
  `${SCHEDULE_BLOCK_COLUMNS}, task:tasks!schedule_blocks_task_belongs_to_owner(${TASK_COLUMNS})`;

export function rowToScheduleBlock(row: ScheduleBlockRow): ScheduleBlock {
  return {
    id: row.id,
    taskId: row.task_id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Forma da linha com o embed. O `task` nunca é nulo: a FK é `not null`. */
type ScheduleBlockWithTaskRow = ScheduleBlockRow & {
  readonly task: Parameters<typeof rowToTask>[0];
};

export function rowToScheduleBlockWithTask(
  row: ScheduleBlockWithTaskRow,
): ScheduleBlockWithTask {
  return { block: rowToScheduleBlock(row), task: rowToTask(row.task) };
}

/**
 * `user_id` está ausente de propósito: quem preenche é o `default auth.uid()`
 * da coluna, validado pela policy de INSERT. E é justamente esse `user_id`
 * gravado pelo servidor que a FK composta usa para provar que a tarefa
 * referenciada pertence a quem está agendando.
 */
export function createInputToInsert(input: CreateScheduleBlockInput): ScheduleBlockInsert {
  return {
    task_id: input.taskId,
    starts_at: input.startsAt.toISOString(),
    ends_at: input.endsAt.toISOString(),
  };
}

/**
 * Reagendar é um UPDATE do próprio bloco — não existe entidade nova só porque
 * a ação mudou de nome. `task_id` não é alterável: mover um bloco para outra
 * tarefa seria criar outro planejamento, não reagendar este.
 */
export function updateInputToUpdate(input: UpdateScheduleBlockInput): ScheduleBlockUpdate {
  return {
    starts_at: input.startsAt.toISOString(),
    ends_at: input.endsAt.toISOString(),
  };
}
