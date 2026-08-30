import { supabase } from "@/lib/supabase";
import { mapPostgrestError, unwrap } from "@/lib/supabase-errors";
import { parseInput } from "@/lib/validation";

import type { Task } from "../domain/task";
import {
  createTaskInputSchema,
  updateTaskInputSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "../domain/task-schemas";
import {
  createInputToInsert,
  rowToTask,
  TASK_COLUMNS,
  updateInputToUpdate,
} from "./task-mapper";

/**
 * Acesso a dados de Task.
 *
 * Nenhuma função recebe ou envia `user_id`. O isolamento entre usuários é
 * responsabilidade do RLS: uma consulta sem filtro de dono já volta contendo
 * apenas as linhas do usuário autenticado, e um UPDATE/DELETE em linha alheia
 * simplesmente não encontra nada.
 *
 * A validação Zod aqui existe para dar mensagem boa ao usuário. A garantia
 * real são as CHECK constraints do banco.
 */

/**
 * Teto explícito da Inbox.
 *
 * O PostgREST corta a resposta em `max_rows` (1000 nesta instalação) e o corte é
 * SILENCIOSO — a lista simplesmente vem menor, sem erro. Declarar o limite aqui
 * não muda o comportamento no volume de uma agenda pessoal; muda o fato de o
 * teto passar a estar escrito no código que o sofre, em vez de morar num arquivo
 * de configuração do servidor. Mesma razão da nota em `daily_activity`.
 */
const OPEN_TASKS_LIMIT = 500;

/** Tarefas abertas, mais importantes primeiro. */
export async function fetchOpenTasks(): Promise<Task[]> {
  const rows = unwrap(
    await supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("status", "TODO")
      // A ordem do enum no Postgres é LOW < MEDIUM < HIGH < URGENT.
      .order("priority", { ascending: false })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(OPEN_TASKS_LIMIT),
  );

  return rows.map(rowToTask);
}

const RECENTLY_COMPLETED_LIMIT = 20;

/** Concluídas recentemente — permite reabrir sem sair da tela. */
export async function fetchRecentlyCompletedTasks(): Promise<Task[]> {
  const rows = unwrap(
    await supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("status", "DONE")
      .order("completed_at", { ascending: false })
      .limit(RECENTLY_COMPLETED_LIMIT),
  );

  return rows.map(rowToTask);
}

/**
 * Uma tarefa pelo id.
 *
 * Usada pela tela de agendamento, que pode ser aberta direto por URL na web —
 * quando não há lista em cache de onde tirar o título e a estimativa. O RLS
 * cuida do resto: o id de outro usuário simplesmente não encontra linha.
 */
export async function fetchTask(id: string): Promise<Task> {
  const row = unwrap(
    await supabase.from("tasks").select(TASK_COLUMNS).eq("id", id).single(),
  );

  return rowToTask(row);
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const parsed = parseInput(createTaskInputSchema, input);

  const row = unwrap(
    await supabase
      .from("tasks")
      .insert(createInputToInsert(parsed))
      .select(TASK_COLUMNS)
      .single(),
  );

  return rowToTask(row);
}

export async function updateTask(input: UpdateTaskInput): Promise<Task> {
  const parsed = parseInput(updateTaskInputSchema, input);

  const row = unwrap(
    await supabase
      .from("tasks")
      .update(updateInputToUpdate(parsed))
      .eq("id", parsed.id)
      .select(TASK_COLUMNS)
      .single(),
  );

  return rowToTask(row);
}

/**
 * Concluir e reabrir enviam APENAS o status.
 *
 * O instante da conclusão é decidido pelo trigger `tasks_sync_completed_at`:
 * um relógio errado no aparelho não pode jogar a tarefa para outro dia. A
 * transição do domínio continua existindo — é ela que prevê o novo estado na
 * atualização otimista da tela.
 */
export async function setTaskCompletion(id: string, completed: boolean): Promise<Task> {
  const row = unwrap(
    await supabase
      .from("tasks")
      .update({ status: completed ? "DONE" : "TODO" })
      .eq("id", id)
      .select(TASK_COLUMNS)
      .single(),
  );

  return rowToTask(row);
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error !== null) throw mapPostgrestError(error);
}
