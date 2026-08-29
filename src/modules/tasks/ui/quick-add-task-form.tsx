"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import { createTaskAction, type TaskFormState } from "../task-actions";
import { TaskFormFields } from "./task-form-fields";

/**
 * Criação rápida.
 *
 * Sem modal: o formulário fica sempre visível no topo da Inbox. Depois de
 * salvar, ele se limpa e devolve o foco ao título para permitir cadastrar
 * várias tarefas em sequência.
 */
export function QuickAddTaskForm() {
  const [state, formAction, isPending] = useActionState<TaskFormState, FormData>(
    createTaskAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const createdId = state?.ok === true ? state.data.id : null;

  useEffect(() => {
    if (createdId === null) return;
    formRef.current?.reset();
    formRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
  }, [createdId]);

  return (
    <form ref={formRef} action={formAction} className="rounded-lg border p-4">
      <TaskFormFields idPrefix="new-task" fieldErrors={state?.ok === false ? state.error.fieldErrors : undefined} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-xs text-destructive">
          {state?.ok === false && state.error.code !== "VALIDATION" ? state.error.message : null}
        </p>
        <Button type="submit" disabled={isPending}>
          <Plus className="size-4" aria-hidden />
          {isPending ? "Adicionando…" : "Adicionar à Inbox"}
        </Button>
      </div>
    </form>
  );
}
