"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";

import type { Task } from "../domain/task";
import { updateTaskAction, type TaskFormState } from "../task-actions";
import { TaskFormFields } from "./task-form-fields";

/**
 * Edição no lugar da linha da tarefa — sem modal, mantendo o contexto da lista.
 */
export function TaskEditForm({
  task,
  onFinished,
}: {
  readonly task: Task;
  readonly onFinished: () => void;
}) {
  const [state, formAction, isPending] = useActionState<TaskFormState, FormData>(
    updateTaskAction,
    null,
  );

  useEffect(() => {
    if (state?.ok === true) onFinished();
  }, [state, onFinished]);

  return (
    <form action={formAction} className="rounded-lg border bg-accent/30 p-4">
      <input type="hidden" name="id" value={task.id} />
      <TaskFormFields
        idPrefix={`edit-${task.id}`}
        defaults={task}
        fieldErrors={state?.ok === false ? state.error.fieldErrors : undefined}
        autoFocusTitle
      />

      <div className="mt-4 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-xs text-destructive">
          {state?.ok === false && state.error.code !== "VALIDATION" ? state.error.message : null}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onFinished} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
