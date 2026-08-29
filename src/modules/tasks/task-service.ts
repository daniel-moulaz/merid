import "server-only";

import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { notFoundError } from "@/lib/errors";
import { isRecordNotFoundError } from "@/lib/prisma-errors";
import { calendarDateToUtcDate, utcDateToCalendarDate } from "@/lib/time";

import {
  taskCompletionFields,
  taskReopenFields,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "./domain/task";
import type {
  CreateTaskInput,
  SetTaskCompletionInput,
  UpdateTaskInput,
} from "./domain/task-schemas";

/**
 * Casos de uso de Task.
 *
 * Invariantes desta camada:
 *  - Toda consulta é escopada pelo `userId` da sessão. `userId` nunca vem do
 *    cliente.
 *  - A entrada já chegou validada (schemas de domínio).
 *  - `dueDate` cruza a fronteira do banco por conversão explícita: no domínio é
 *    data civil ("2026-08-29"), na coluna é `date`.
 */

const TASK_FIELDS = {
  id: true,
  title: true,
  description: true,
  estimatedMinutes: true,
  priority: true,
  dueDate: true,
  status: true,
  completedAt: true,
  projectId: true,
  createdAt: true,
} as const;

type TaskWritableFields = {
  title: string;
  description: string | null;
  estimatedMinutes: number;
  priority: TaskPriority;
  dueDate: Date | null;
  projectId: string | null;
};

/** Tudo que `updateOwnedTask` pode escrever. Evita `Record<string, unknown>`. */
type TaskUpdateFields =
  | TaskWritableFields
  | ReturnType<typeof taskCompletionFields>
  | ReturnType<typeof taskReopenFields>;

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  priority: TaskPriority;
  dueDate: Date | null;
  status: TaskStatus;
  completedAt: Date | null;
  projectId: string | null;
  createdAt: Date;
};

function toTask(row: TaskRow): Task {
  return {
    ...row,
    dueDate: row.dueDate === null ? null : utcDateToCalendarDate(row.dueDate),
  };
}

/** Campos de escrita compartilhados por criação e edição. */
function toWritableFields(input: CreateTaskInput): TaskWritableFields {
  return {
    title: input.title,
    description: input.description,
    estimatedMinutes: input.estimatedMinutes,
    priority: input.priority,
    dueDate: input.dueDate === null ? null : calendarDateToUtcDate(input.dueDate),
    projectId: input.projectId,
  };
}

/**
 * A FK de `project_id` não é composta com `user_id` (uma FK composta impediria
 * o `ON DELETE SET NULL`), então a posse do projeto é verificada aqui.
 */
async function assertProjectBelongsToUser(
  user: SessionUser,
  projectId: string | null,
): Promise<void> {
  if (projectId === null) return;

  const count = await prisma.project.count({ where: { id: projectId, userId: user.id } });
  if (count === 0) throw notFoundError("Projeto não encontrado.");
}

export type InboxTasks = {
  /** Tarefas abertas e ainda não agendadas. */
  readonly open: readonly Task[];
  /** Concluídas recentemente, para permitir reabrir sem sair da tela. */
  readonly recentlyCompleted: readonly Task[];
};

const RECENTLY_COMPLETED_LIMIT = 20;

/**
 * Inbox = tarefas SEM nenhum bloco de agenda.
 *
 * A definição vem da regra do produto: uma tarefa só sai da Inbox quando ganha
 * um "quando". Assim que a agenda existir, nada aqui muda.
 */
export async function getInboxTasks(user: SessionUser): Promise<InboxTasks> {
  const unscheduled = { userId: user.id, scheduleBlocks: { none: {} } } as const;

  const [open, recentlyCompleted] = await Promise.all([
    prisma.task.findMany({
      where: { ...unscheduled, status: "TODO" },
      select: TASK_FIELDS,
      // A ordem do enum no banco é LOW < MEDIUM < HIGH < URGENT, então `desc`
      // traz o mais importante primeiro. Prazos nulos vão para o fim (padrão
      // do Postgres em ASC).
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.task.findMany({
      where: { ...unscheduled, status: "DONE" },
      select: TASK_FIELDS,
      orderBy: { completedAt: "desc" },
      take: RECENTLY_COMPLETED_LIMIT,
    }),
  ]);

  return {
    open: open.map(toTask),
    recentlyCompleted: recentlyCompleted.map(toTask),
  };
}

export async function createTask(user: SessionUser, input: CreateTaskInput): Promise<Task> {
  await assertProjectBelongsToUser(user, input.projectId);

  const row = await prisma.task.create({
    data: { ...toWritableFields(input), userId: user.id },
    select: TASK_FIELDS,
  });

  return toTask(row);
}

export async function updateTask(user: SessionUser, input: UpdateTaskInput): Promise<Task> {
  const { id, ...fields } = input;
  await assertProjectBelongsToUser(user, input.projectId);

  return updateOwnedTask(user, id, toWritableFields(fields));
}

export async function setTaskCompletion(
  user: SessionUser,
  input: SetTaskCompletionInput,
  now: Date = new Date(),
): Promise<Task> {
  const fields = input.completed ? taskCompletionFields(now) : taskReopenFields();
  return updateOwnedTask(user, input.id, fields);
}

/**
 * Atualiza garantindo a posse na própria cláusula `where`: se a tarefa for de
 * outro usuário, o update não encontra nada — não existe janela entre
 * "verificar" e "escrever".
 */
async function updateOwnedTask(
  user: SessionUser,
  id: string,
  data: TaskUpdateFields,
): Promise<Task> {
  try {
    const row = await prisma.task.update({
      where: { id_userId: { id, userId: user.id } },
      data,
      select: TASK_FIELDS,
    });
    return toTask(row);
  } catch (error) {
    if (isRecordNotFoundError(error)) throw notFoundError("Tarefa não encontrada.");
    throw error;
  }
}
