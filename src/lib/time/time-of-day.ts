import { TZDate } from "@date-fns/tz";

import { assertCalendarDate, type CalendarDate } from "./calendar-date";
import { assertTimeZone } from "./time-zone";

/**
 * Horário civil ("HH:MM"): uma hora do relógio, SEM data e SEM timezone.
 *
 * É o irmão de `CalendarDate` e existe pelo mesmo motivo: "14:00" não é um
 * instante. Só vira instante quando combinado com um DIA e um TIMEZONE — e
 * essa combinação acontece em um lugar só, `instantFrom` abaixo.
 *
 * Regra: nenhum componente de UI monta um horário somando offset. Formulário
 * fala `TimeOfDay`; banco fala `Date` (instante); a ponte é este módulo.
 */
export type TimeOfDay = string;

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;

export function isTimeOfDay(value: unknown): value is TimeOfDay {
  return typeof value === "string" && TIME_OF_DAY_PATTERN.test(value);
}

export function assertTimeOfDay(value: unknown): TimeOfDay {
  if (!isTimeOfDay(value)) {
    throw new TypeError(`Horário inválido: ${String(value)}`);
  }
  return value;
}

/** "14:30" -> 870. Minutos desde a meia-noite do relógio. */
export function timeOfDayToMinutes(value: TimeOfDay): number {
  const time = assertTimeOfDay(value);
  return Number(time.slice(0, 2)) * MINUTES_PER_HOUR + Number(time.slice(3, 5));
}

/**
 * 870 -> "14:30". Valores fora de [0, 1440) dão a volta no relógio, o que é
 * exatamente o comportamento desejado ao somar duração a um horário
 * (23:30 + 60min = 00:30 do dia seguinte).
 */
export function minutesToTimeOfDay(minutes: number): TimeOfDay {
  if (!Number.isInteger(minutes)) {
    throw new TypeError(`minutos precisa ser inteiro, recebido: ${minutes}`);
  }

  // `%` em JavaScript preserva o sinal; a soma extra corrige negativos.
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / MINUTES_PER_HOUR);
  const rest = wrapped % MINUTES_PER_HOUR;

  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Soma minutos ao relógio, dando a volta na meia-noite. */
export function addMinutesToTimeOfDay(value: TimeOfDay, minutes: number): TimeOfDay {
  return minutesToTimeOfDay(timeOfDayToMinutes(value) + minutes);
}

/**
 * Arredonda para o múltiplo de `step` mais próximo, para cima.
 * Usado para propor "agora" como início de bloco sem oferecer 14:37.
 */
export function ceilTimeOfDayToStep(value: TimeOfDay, step: number): TimeOfDay {
  if (!Number.isInteger(step) || step <= 0) {
    throw new TypeError(`step precisa ser inteiro positivo, recebido: ${step}`);
  }
  return minutesToTimeOfDay(Math.ceil(timeOfDayToMinutes(value) / step) * step);
}

/**
 * DIA + HORÁRIO + TIMEZONE -> INSTANTE.
 *
 * O único ponto do app onde um horário do relógio vira um momento no tempo.
 * Nenhuma soma manual de offset UTC: o `TZDate` resolve o offset correto para
 * aquela data naquele fuso, inclusive em transições de horário de verão.
 */
export function instantFrom(
  date: CalendarDate,
  time: TimeOfDay,
  timeZone: string,
): Date {
  const day = assertCalendarDate(date);
  const clock = assertTimeOfDay(time);
  assertTimeZone(timeZone);

  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const dayOfMonth = Number(day.slice(8, 10));
  const hours = Number(clock.slice(0, 2));
  const minutes = Number(clock.slice(3, 5));

  // Normalizado para `Date` puro: o tipo `TZDate` não deve vazar deste módulo.
  return new Date(
    TZDate.tz(timeZone, year, month - 1, dayOfMonth, hours, minutes, 0, 0).getTime(),
  );
}

/**
 * INSTANTE -> horário no relógio do usuário.
 *
 * `hourCycle: "h23"` é obrigatório: sem ele o Intl formata meia-noite como
 * "24:00" em algumas localidades, e o valor deixaria de ser um `TimeOfDay`.
 */
export function timeOfDayInTimeZone(instant: Date, timeZone: string): TimeOfDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: assertTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return assertTimeOfDay(`${get("hour")}:${get("minute")}`);
}

/**
 * Formata um intervalo para leitura: "14:00 → 15:30".
 * A seta deixa explícito que o fim é exclusivo — o bloco termina ali.
 */
export function formatTimeRangeInTimeZone(
  start: Date,
  end: Date,
  timeZone: string,
): string {
  return `${timeOfDayInTimeZone(start, timeZone)} → ${timeOfDayInTimeZone(end, timeZone)}`;
}
