"use client";

import { Check, Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import type { CalendarDate } from "@/lib/time";
import { formatCalendarDate, formatMinutes } from "@/lib/time";
import { cn } from "@/lib/utils";

import { isDueToday, isOverdue, TASK_PRIORITY_LABEL, type Task, type TaskPriority } from "../domain/task";
import { setTaskCompletionAction } from "../task-actions";
import { TaskEditForm } from "./task-edit-form";

/**
 * Uma linha da lista. A duração aparece sempre — é a informação que diz se a
 * tarefa cabe no dia.
 */

const PRIORITY_DOT: Record<TaskPriority, string> = {
  LOW: "bg-muted-foreground/30",
  MEDIUM: "bg-muted-foreground/60",
  HIGH: "bg-amber-500",
  URGENT: "bg-destructive",
};

export function TaskItem({ task, today }: { readonly task: Task; readonly today: CalendarDate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [isToggling, startToggle] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDone = task.status === "DONE";

  function toggleCompletion() {
    setError(null);
    startToggle(async () => {
      const result = await setTaskCompletionAction({ id: task.id, completed: !isDone });
      if (!result.ok) setError(result.error.message);
    });
  }

  if (isEditing) {
    return (
      <li>
        <TaskEditForm task={task} onFinished={() => setIsEditing(false)} />
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 rounded-md px-1 py-2.5 hover:bg-accent/40">
      <button
        type="button"
        onClick={toggleCompletion}
        disabled={isToggling}
        aria-pressed={isDone}
        aria-label={isDone ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          isDone
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-foreground",
          isToggling && "opacity-50",
        )}
      >
        {isDone ? <Check className="size-3" aria-hidden /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 break-words text-sm",
              isDone && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
          <span
            aria-label={`Prioridade ${TASK_PRIORITY_LABEL[task.priority].toLowerCase()}`}
            title={`Prioridade ${TASK_PRIORITY_LABEL[task.priority].toLowerCase()}`}
            className={cn("size-1.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority])}
          />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{formatMinutes(task.estimatedMinutes)}</span>
          {task.dueDate !== null ? <DueDateBadge task={task} today={today} /> : null}
          {error !== null ? <span className="text-destructive">{error}</span> : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsEditing(true)}
        aria-label={`Editar ${task.title}`}
        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

/**
 * Prazo ≠ horário: mostramos apenas o DIA, e destacamos quando já passou.
 */
function DueDateBadge({ task, today }: { readonly task: Task; readonly today: CalendarDate }) {
  if (task.dueDate === null) return null;

  const overdue = isOverdue(task, today);
  const dueToday = isDueToday(task, today);

  const label = dueToday ? "hoje" : formatCalendarDate(task.dueDate);

  return (
    <span
      className={cn(overdue && "font-medium text-destructive", dueToday && "font-medium text-foreground")}
      title={`Prazo: ${formatCalendarDate(task.dueDate, { day: "2-digit", month: "long", year: "numeric" })}`}
    >
      {overdue ? "atrasada · " : ""}
      {label}
    </span>
  );
}
