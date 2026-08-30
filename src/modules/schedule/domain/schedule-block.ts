import {
  addDaysToCalendarDate,
  addMinutesToTimeOfDay,
  instantFrom,
  minutesBetween,
  startOfDayInTimeZone,
  type CalendarDate,
  type TimeOfDay,
} from "@/lib/time";
import type { Task } from "@/modules/tasks/domain/task";

/**
 * ScheduleBlock = QUANDO pretendo executar uma tarefa.
 *
 * A distinção com Task é a proposta central do produto e precisa sobreviver ao
 * código: aqui não existe título, prioridade nem prazo. Um bloco é um intervalo
 * e um ponteiro para a tarefa. Apagar o bloco não toca na tarefa.
 */
export type ScheduleBlock = {
  readonly id: string;
  readonly taskId: string;
  readonly startsAt: Date;
  /** EXCLUSIVO: o intervalo é [startsAt, endsAt). */
  readonly endsAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * O que a agenda precisa exibir: o bloco e a tarefa que ele planeja.
 *
 * Vem em uma única consulta (embed do PostgREST), não em N+1.
 */
export type ScheduleBlockWithTask = {
  readonly block: ScheduleBlock;
  readonly task: Task;
};

/** Quanto tempo o bloco reserva. NÃO é `task.estimatedMinutes` — ver R4. */
export function blockDurationMinutes(block: Pick<ScheduleBlock, "startsAt" | "endsAt">): number {
  return minutesBetween(block.startsAt, block.endsAt);
}

/**
 * Fim SUGERIDO ao agendar: início + estimativa da tarefa.
 *
 * É sugestão, não regra. O usuário pode reservar 1h para uma tarefa estimada em
 * 1h30 — e a estimativa da tarefa NÃO muda por causa disso (R4). Nada neste
 * módulo escreve em `task.estimatedMinutes`.
 */
export function suggestEndTime(start: TimeOfDay, estimatedMinutes: number): TimeOfDay {
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0) {
    throw new TypeError(
      `estimatedMinutes precisa ser inteiro positivo, recebido: ${estimatedMinutes}`,
    );
  }
  return addMinutesToTimeOfDay(start, estimatedMinutes);
}

/**
 * Formulário (dia + dois horários civis) -> instantes gravados no banco.
 *
 * Um horário do relógio só vira instante junto com um DIA e um TIMEZONE. Este
 * é o único lugar do módulo que faz essa ponte.
 *
 * Quando o fim é menor ou igual ao início, o bloco ATRAVESSA A MEIA-NOITE
 * (23:00 -> 01:00) e o fim cai no dia seguinte. É o que qualquer calendário
 * faz, e a alternativa — recusar — impediria o caso legítimo de trabalhar de
 * madrugada.
 */
export function resolveBlockInstants(
  values: {
    readonly date: CalendarDate;
    readonly startTime: TimeOfDay;
    readonly endTime: TimeOfDay;
  },
  timeZone: string,
): { readonly startsAt: Date; readonly endsAt: Date } {
  const startsAt = instantFrom(values.date, values.startTime, timeZone);
  const sameDayEnd = instantFrom(values.date, values.endTime, timeZone);

  if (sameDayEnd.getTime() > startsAt.getTime()) {
    return { startsAt, endsAt: sameDayEnd };
  }

  // Atravessa a meia-noite: o mesmo horário civil, no DIA SEGUINTE.
  //
  // O dia seguinte é obtido no calendário (`addDaysToCalendarDate`) e depois
  // resolvido no fuso, e não somando 24 h em milissegundos. Em dia de transição
  // de horário de verão o dia civil tem 23 ou 25 horas, e a soma fixa punha o
  // fim uma hora fora do lugar — um bloco 23:00 → 01:00 virava 23:00 → 00:00 ou
  // → 02:00, sem nada indicando. É a mesma regra que `segmentBlockByDay` já
  // seguia na grade semanal.
  return {
    startsAt,
    endsAt: instantFrom(
      addDaysToCalendarDate(values.date, 1),
      values.endTime,
      timeZone,
    ),
  };
}

/**
 * -------------------------------------------------------------------------
 * A definição de TAREFA NÃO AGENDADA — uma só, e mora aqui.
 * -------------------------------------------------------------------------
 *
 * Uma tarefa aberta está NÃO AGENDADA quando não tem nenhum bloco que termine
 * a partir do início do dia de hoje (no fuso do usuário).
 *
 * Duas decisões dentro dessa frase:
 *
 * 1. **Bloco no passado não conta como agendamento.** Uma tarefa com bloco
 *    ontem que continua aberta não foi feita — ela volta a precisar de horário,
 *    e some da lista quem só olhasse "tem bloco?".
 *
 * 2. **A fronteira é o INÍCIO DO DIA, não `agora`.** Usar `now()` faria a chave
 *    de cache mudar a cada segundo. Com granularidade de dia a consulta é
 *    estável, e um bloco de hoje que já passou não é duplicado na lista porque
 *    ele continua visível na timeline logo acima.
 */
export function unscheduledBoundary(today: CalendarDate, timeZone: string): Date {
  return startOfDayInTimeZone(today, timeZone);
}

/** Tarefas abertas sem bloco relevante, preservando a ordem recebida. */
export function selectUnscheduledTasks(
  openTasks: readonly Task[],
  scheduledTaskIds: ReadonlySet<string>,
): Task[] {
  return openTasks.filter(
    (task) => task.status === "TODO" && !scheduledTaskIds.has(task.id),
  );
}
