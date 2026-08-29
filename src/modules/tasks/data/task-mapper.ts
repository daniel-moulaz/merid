import { assertCalendarDate } from "@/lib/time";
import type { Database } from "@/lib/database.types";

import type { Task } from "../domain/task";
import type { CreateTaskInput, UpdateTaskInput } from "../domain/task-schemas";

/**
 * Fronteira entre a linha do banco e o tipo de domínio.
 *
 * Detalhe que a arquitetura anterior não tinha: o PostgREST devolve colunas
 * `date` como string "YYYY-MM-DD", que é exatamente a representação de
 * `CalendarDate`. O prazo atravessa a rede sem nunca virar um `Date` — some a
 * classe inteira de bugs de "mudou de dia".
 */

/** Exatamente as colunas de `TASK_COLUMNS` — `user_id` não é buscado. */
type TaskRow = Pick<
  Database["public"]["Tables"]["tasks"]["Row"],
  | "id"
  | "title"
  | "description"
  | "estimated_minutes"
  | "priority"
  | "due_date"
  | "status"
  | "completed_at"
  | "created_at"
  | "updated_at"
>;
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

/** Colunas buscadas. Explícito para não trafegar campo que a tela não usa. */
export const TASK_COLUMNS =
  "id, title, description, estimated_minutes, priority, due_date, status, completed_at, created_at, updated_at";

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    estimatedMinutes: row.estimated_minutes,
    priority: row.priority,
    // Validado na entrada: se o banco devolver algo que não é data civil,
    // queremos falhar aqui e não exibir um dia errado.
    dueDate: row.due_date === null ? null : assertCalendarDate(row.due_date),
    status: row.status,
    completedAt: row.completed_at === null ? null : new Date(row.completed_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * `user_id` está ausente de propósito: quem preenche é o `default auth.uid()`
 * da coluna, validado pela policy de INSERT. O cliente não tem como mentir
 * sobre o dono do dado.
 */
export function createInputToInsert(input: CreateTaskInput): TaskInsert {
  return {
    title: input.title,
    description: input.description,
    estimated_minutes: input.estimatedMinutes,
    priority: input.priority,
    due_date: input.dueDate,
  };
}

export function updateInputToUpdate(input: UpdateTaskInput): TaskUpdate {
  return {
    title: input.title,
    description: input.description,
    estimated_minutes: input.estimatedMinutes,
    priority: input.priority,
    due_date: input.dueDate,
  };
}
