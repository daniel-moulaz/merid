import { z } from "zod";

import { isCalendarDate, isTimeOfDay } from "@/lib/time";

/**
 * Schemas do agendamento — a fronteira entre o formulário e o domínio.
 *
 * Há DOIS níveis de propósito:
 *
 *  - `scheduleFormSchema`: o que o usuário preenche — um DIA e dois HORÁRIOS
 *    civis. Nada aqui é um instante, porque "14:00" sem fuso não é um momento.
 *  - `createScheduleBlockInputSchema`: o que vai para o banco — INSTANTES, já
 *    resolvidos com o fuso do usuário por `resolveBlockInstants`.
 *
 * Separar os dois é o que impede um componente de tentar montar um instante
 * sozinho, somando offset na mão.
 *
 * Como no resto do app, estas validações existem para dar boa mensagem. A
 * garantia real são as CHECK constraints e a FK composta do banco.
 */

/** Teto de duração de um bloco, espelhando `schedule_blocks_max_duration`. */
export const MAX_BLOCK_MINUTES = 1440;

export const scheduleFormSchema = z.object({
  taskId: z.uuid("Tarefa inválida."),

  date: z
    .string("Escolha uma data.")
    .refine(isCalendarDate, "Use uma data válida no formato AAAA-MM-DD."),

  startTime: z
    .string("Escolha o horário de início.")
    .refine(isTimeOfDay, "Use um horário válido no formato HH:MM."),

  endTime: z
    .string("Escolha o horário de fim.")
    .refine(isTimeOfDay, "Use um horário válido no formato HH:MM."),
});

export type ScheduleFormValues = z.output<typeof scheduleFormSchema>;

/**
 * Entrada do repositório. `userId` está ausente de propósito: quem preenche é
 * o `default auth.uid()` da coluna. O cliente não tem como mentir sobre o dono.
 */
export const createScheduleBlockInputSchema = z
  .object({
    taskId: z.uuid("Tarefa inválida."),
    startsAt: z.date("Início inválido."),
    endsAt: z.date("Fim inválido."),
  })
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), {
    message: "O fim precisa ser depois do início.",
    path: ["endTime"],
  })
  .refine(
    (value) =>
      value.endsAt.getTime() - value.startsAt.getTime() <= MAX_BLOCK_MINUTES * 60_000,
    { message: "Um bloco não pode passar de 24 horas.", path: ["endTime"] },
  );

export type CreateScheduleBlockInput = z.output<typeof createScheduleBlockInputSchema>;

export const updateScheduleBlockInputSchema = z
  .object({
    id: z.uuid("Bloco inválido."),
    startsAt: z.date("Início inválido."),
    endsAt: z.date("Fim inválido."),
  })
  .refine((value) => value.endsAt.getTime() > value.startsAt.getTime(), {
    message: "O fim precisa ser depois do início.",
    path: ["endTime"],
  })
  .refine(
    (value) =>
      value.endsAt.getTime() - value.startsAt.getTime() <= MAX_BLOCK_MINUTES * 60_000,
    { message: "Um bloco não pode passar de 24 horas.", path: ["endTime"] },
  );

export type UpdateScheduleBlockInput = z.output<typeof updateScheduleBlockInputSchema>;
