import { TZDate } from "@date-fns/tz";

import {
  addDaysToCalendarDate,
  assertCalendarDate,
  type CalendarDate,
} from "./calendar-date";

/**
 * Conversões entre INSTANTES (`Date`, sempre UTC no banco) e o CALENDÁRIO do
 * usuário. A fronteira de dia ("hoje", um quadrado do heatmap, um dia de
 * streak) depende do timezone do usuário — nunca do relógio do servidor nem do
 * navegador.
 */

/** Timezone usado quando o usuário ainda não escolheu um. */
export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function assertTimeZone(timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    throw new TypeError(`Timezone IANA inválido: ${timeZone}`);
  }
  return timeZone;
}

/**
 * Em que DIA do calendário do usuário este instante caiu?
 *
 * Ex.: 2026-08-29T02:30:00Z em "America/Sao_Paulo" (UTC-3) é ainda 2026-08-28.
 */
export function toCalendarDateInTimeZone(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: assertTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return assertCalendarDate(`${get("year")}-${get("month")}-${get("day")}`);
}

/** O dia de hoje no calendário do usuário. `now` é injetável para testes. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): CalendarDate {
  return toCalendarDateInTimeZone(now, timeZone);
}

/**
 * Instante em que o dia começa para o usuário.
 *
 * Em dias de entrada no horário de verão a meia-noite local pode NÃO EXISTIR
 * (o relógio pula 00:00 -> 01:00). Nesses casos retornamos o primeiro instante
 * existente do dia (01:00 local), que é o comportamento correto para
 * "começo do dia".
 */
export function startOfDayInTimeZone(date: CalendarDate, timeZone: string): Date {
  const value = assertCalendarDate(date);
  assertTimeZone(timeZone);

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  // `TZDate` é subclasse de `Date` e serializa com offset. Normalizamos para um
  // `Date` puro para que nada além deste módulo precise conhecer o tipo.
  return new Date(TZDate.tz(timeZone, year, month - 1, day, 0, 0, 0, 0).getTime());
}

/**
 * Primeiro instante do dia SEGUINTE. Use como limite superior EXCLUSIVO
 * (`startsAt >= start AND startsAt < endExclusive`) — comparar com "23:59:59"
 * perde eventos e quebra em dias de horário de verão.
 */
export function endOfDayExclusiveInTimeZone(date: CalendarDate, timeZone: string): Date {
  return startOfDayInTimeZone(addDaysToCalendarDate(date, 1), timeZone);
}

export type InstantRange = {
  readonly start: Date;
  /** Exclusivo. */
  readonly endExclusive: Date;
};

/** Intervalo semiaberto que cobre um dia do calendário do usuário. */
export function dayRangeInTimeZone(date: CalendarDate, timeZone: string): InstantRange {
  return {
    start: startOfDayInTimeZone(date, timeZone),
    endExclusive: endOfDayExclusiveInTimeZone(date, timeZone),
  };
}

/**
 * Intervalo semiaberto cobrindo de `from` até `to`, ambos inclusivos como DIAS.
 * Base das consultas de semana e do heatmap.
 */
export function calendarRangeInTimeZone(
  from: CalendarDate,
  to: CalendarDate,
  timeZone: string,
): InstantRange {
  return {
    start: startOfDayInTimeZone(from, timeZone),
    endExclusive: endOfDayExclusiveInTimeZone(to, timeZone),
  };
}
