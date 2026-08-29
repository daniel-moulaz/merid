import { z } from "zod";

import { isCalendarDate, MAX_ESTIMATED_MINUTES, MIN_ESTIMATED_MINUTES } from "@/lib/time";

import {
  DEFAULT_TASK_PRIORITY,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_TITLE_MAX_LENGTH,
} from "./task";

/**
 * Schemas de entrada. São a fronteira entre o mundo externo (formulários,
 * futuros clientes de API) e o domínio.
 *
 * Campos de formulário chegam sempre como string: "" significa "não informado"
 * e é normalizado para `null` antes da validação.
 */

/** Trata "" e ausência como `null`, mantendo o schema real para o resto. */
function optional<TSchema extends z.ZodType>(schema: TSchema) {
  return z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.union([z.null(), schema]),
  );
}

const calendarDateSchema = z
  .string()
  .refine(isCalendarDate, "Use uma data válida no formato AAAA-MM-DD.");

export const createTaskInputSchema = z.object({
  title: z
    .string("Informe um título.")
    .trim()
    .min(1, "Informe um título.")
    .max(TASK_TITLE_MAX_LENGTH, `Use no máximo ${TASK_TITLE_MAX_LENGTH} caracteres.`),

  description: optional(
    z
      .string()
      .trim()
      .max(TASK_DESCRIPTION_MAX_LENGTH, `Use no máximo ${TASK_DESCRIPTION_MAX_LENGTH} caracteres.`),
  ),

  // Duração é obrigatória: é o que permite saber se o dia cabe.
  estimatedMinutes: z.coerce
    .number("Informe a duração em minutos.")
    .int("Use minutos inteiros.")
    .min(MIN_ESTIMATED_MINUTES, `A duração mínima é de ${MIN_ESTIMATED_MINUTES} minuto.`)
    .max(MAX_ESTIMATED_MINUTES, "A duração máxima é de 24 horas."),

  priority: z.enum(TASK_PRIORITIES, "Prioridade inválida.").default(DEFAULT_TASK_PRIORITY),

  /** Prazo: dia, nunca horário. */
  dueDate: optional(calendarDateSchema),

  projectId: optional(z.uuid("Projeto inválido.")),
});

export type CreateTaskInput = z.output<typeof createTaskInputSchema>;

export const updateTaskInputSchema = createTaskInputSchema.extend({
  id: z.uuid("Tarefa inválida."),
});

export type UpdateTaskInput = z.output<typeof updateTaskInputSchema>;

export const setTaskCompletionInputSchema = z.object({
  id: z.uuid("Tarefa inválida."),
  completed: z.boolean(),
});

export type SetTaskCompletionInput = z.output<typeof setTaskCompletionInputSchema>;
