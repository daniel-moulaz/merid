import { z } from "zod";

import { isCalendarDate, MAX_ESTIMATED_MINUTES, MIN_ESTIMATED_MINUTES } from "@/lib/time";

import {
  DEFAULT_TASK_PRIORITY,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_PRIORITIES,
  TASK_TITLE_MAX_LENGTH,
} from "./task";

/**
 * Schemas de entrada — a fronteira entre o formulário e o domínio.
 *
 * Os tipos de ENTRADA são concretos de propósito (nada de `unknown` vindo de
 * `preprocess`/`coerce`): é isso que permite o React Hook Form inferir os
 * campos. A conversão de string para número era necessária no `FormData` da
 * arquitetura anterior; aqui o formulário já entrega os tipos certos.
 *
 * Estas validações existem para dar boa mensagem ao usuário. A garantia real
 * são as CHECK constraints do banco — o app não é a autoridade.
 */

/** Campo textual opcional: vazio e ausente viram `null`. */
const optionalText = (maxLength: number, tooLongMessage: string) =>
  z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    })
    .refine((value) => value === null || value.length <= maxLength, tooLongMessage);

export const createTaskInputSchema = z.object({
  title: z
    .string("Informe um título.")
    .trim()
    .min(1, "Informe um título.")
    .max(TASK_TITLE_MAX_LENGTH, `Use no máximo ${TASK_TITLE_MAX_LENGTH} caracteres.`),

  description: optionalText(
    TASK_DESCRIPTION_MAX_LENGTH,
    `Use no máximo ${TASK_DESCRIPTION_MAX_LENGTH} caracteres.`,
  ),

  // Duração é obrigatória: é o que permite saber se o dia cabe.
  estimatedMinutes: z
    .number("Informe a duração em minutos.")
    .int("Use minutos inteiros.")
    .min(MIN_ESTIMATED_MINUTES, `A duração mínima é de ${MIN_ESTIMATED_MINUTES} minuto.`)
    .max(MAX_ESTIMATED_MINUTES, "A duração máxima é de 24 horas."),

  priority: z.enum(TASK_PRIORITIES, "Prioridade inválida.").default(DEFAULT_TASK_PRIORITY),

  /** Prazo: DIA, nunca horário. Vazio significa "sem prazo". */
  dueDate: z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    })
    .refine(
      (value) => value === null || isCalendarDate(value),
      "Use uma data válida no formato AAAA-MM-DD.",
    ),
});

export type CreateTaskInput = z.output<typeof createTaskInputSchema>;
/** Tipo dos campos do formulário (antes das transformações). */
export type CreateTaskFormValues = z.input<typeof createTaskInputSchema>;

export const updateTaskInputSchema = createTaskInputSchema.extend({
  id: z.uuid("Tarefa inválida."),
});

export type UpdateTaskInput = z.output<typeof updateTaskInputSchema>;
