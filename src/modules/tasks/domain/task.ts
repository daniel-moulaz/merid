import type { CalendarDate } from "@/lib/time";

/**
 * Task = O QUE precisa ser feito.
 *
 * Uma Task NÃO tem horário. Quando pretendo executá-la é responsabilidade do
 * ScheduleBlock. `dueDate` é prazo ("até sexta"), nunca início.
 */

export const TASK_STATUSES = ["TODO", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const DEFAULT_TASK_PRIORITY: TaskPriority = "MEDIUM";

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

/**
 * Peso da prioridade no cálculo de consistência.
 * Concluir o que é importante conta mais do que concluir muitas coisas.
 * A fórmula está documentada em docs/PRODUCT.md. Ainda não é usada em código.
 */
export const TASK_PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  LOW: 0.5,
  MEDIUM: 1,
  HIGH: 1.5,
  URGENT: 2,
};

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  /** Estimativa de esforço. Não é a duração alocada na agenda. */
  readonly estimatedMinutes: number;
  readonly priority: TaskPriority;
  /** Prazo como data civil. `null` = sem prazo. */
  readonly dueDate: CalendarDate | null;
  readonly status: TaskStatus;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/** Uma tarefa está atrasada se ainda está aberta e o prazo já passou. */
export function isOverdue(
  task: Pick<Task, "status" | "dueDate">,
  today: CalendarDate,
): boolean {
  if (task.status === "DONE" || task.dueDate === null) return false;
  return task.dueDate < today;
}

/** Vence exatamente hoje (ainda dá tempo). */
export function isDueToday(
  task: Pick<Task, "status" | "dueDate">,
  today: CalendarDate,
): boolean {
  return task.status === "TODO" && task.dueDate === today;
}

/**
 * Campos de conclusão.
 *
 * `status` e `completedAt` precisam andar juntos — o banco tem um CHECK que
 * recusa a combinação inconsistente. Manter a transição aqui, e não espalhada
 * pelos casos de uso, garante que reabrir SEMPRE limpe `completedAt`.
 */
export function taskCompletionFields(now: Date): {
  status: TaskStatus;
  completedAt: Date;
} {
  return { status: "DONE", completedAt: now };
}

export function taskReopenFields(): { status: TaskStatus; completedAt: null } {
  return { status: "TODO", completedAt: null };
}
