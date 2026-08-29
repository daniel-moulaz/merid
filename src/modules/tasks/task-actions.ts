"use server";

import { revalidatePath } from "next/cache";

import { runAction, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth/session";
import { formDataToObject, parseInput } from "@/lib/validation";

import {
  createTaskInputSchema,
  setTaskCompletionInputSchema,
  updateTaskInputSchema,
} from "./domain/task-schemas";
import { createTask, setTaskCompletion, updateTask } from "./task-service";

/**
 * Server Actions: a fronteira HTTP do módulo.
 *
 * Responsabilidade: autenticar -> validar -> chamar o caso de uso ->
 * revalidar cache. Nenhuma regra de negócio mora aqui.
 */

/** Telas afetadas por qualquer escrita em tarefa. */
const AFFECTED_PATHS = ["/inbox"] as const;

function revalidateTaskViews(): void {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

export type TaskFormState = ActionResult<{ id: string }> | null;

export async function createTaskAction(
  _previousState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  return runAction(async () => {
    const user = await requireUser();
    const input = parseInput(createTaskInputSchema, formDataToObject(formData));

    const task = await createTask(user, input);
    revalidateTaskViews();

    return { id: task.id };
  });
}

export async function updateTaskAction(
  _previousState: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  return runAction(async () => {
    const user = await requireUser();
    const input = parseInput(updateTaskInputSchema, formDataToObject(formData));

    const task = await updateTask(user, input);
    revalidateTaskViews();

    return { id: task.id };
  });
}

export async function setTaskCompletionAction(input: {
  id: string;
  completed: boolean;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const parsed = parseInput(setTaskCompletionInputSchema, input);

    await setTaskCompletion(user, parsed);
    revalidateTaskViews();

    return undefined;
  });
}
