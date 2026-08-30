import {
  addDaysToCalendarDate,
  calendarRangeInTimeZone,
  daysBetweenCalendarDates,
  formatCalendarDate,
  timeOfDayInTimeZone,
  timeOfDayToMinutes,
  toCalendarDateInTimeZone,
  weekdayOfCalendarDate,
  type CalendarDate,
  type InstantRange,
} from "@/lib/time";

import type { LaneEntry } from "./lane-packing";
import type { Interval } from "./overlap";

/**
 * A semana — puro, sem pixel e sem React.
 *
 * ## Por que a grade semanal mede o tempo diferente da tela Hoje
 *
 * A tela Hoje posiciona por minutos DECORRIDOS desde o início do dia, e a
 * régua adapta os rótulos a partir do instante: num dia de horário de verão
 * ela honestamente pula de 01:00 para 03:00. Isso funciona porque há uma
 * coluna só.
 *
 * Na semana, sete colunas dividem UMA régua. Se ela seguisse minutos
 * decorridos, o dia da transição ficaria deslocado uma hora em relação às
 * outras seis colunas — lido como defeito. Se ela adaptasse, ficaria errada
 * para os outros seis dias.
 *
 * Por isso a grade semanal posiciona pela HORA DO RELÓGIO local, obtida via
 * `timeOfDayInTimeZone` (nunca por aritmética de epoch). A régua passa a ser
 * verdadeira para as sete colunas, que é a função primária de uma grade
 * semanal.
 *
 * **O preço, explícito:** um bloco que ATRAVESSA a transição aparece com a
 * extensão do relógio, não a real — 01:30 → 03:30 ocupa duas horas de grade
 * tendo durado uma. É a mesma escolha que os calendários fazem, e nada disso
 * contamina os dados: no banco continuam sendo dois instantes, e a tela Hoje
 * continua mostrando a duração real.
 */

export const DAYS_IN_WEEK = 7;
export const MINUTES_PER_DAY = 1440;

/** 0 = domingo … 6 = sábado. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Primeiro dia da semana — decisão de produto, em um lugar só.
 *
 * Quando o perfil ganhar preferência de início de semana, é este valor que
 * passa a vir de lá; nenhum outro arquivo conhece o número. As funções abaixo
 * já recebem o parâmetro, então a mudança não vira uma caçada por offsets
 * espalhados.
 */
export const WEEK_STARTS_ON: Weekday = 1;

/** A segunda-feira (ou o dia configurado) da semana que contém `date`. */
export function startOfWeek(
  date: CalendarDate,
  weekStartsOn: Weekday = WEEK_STARTS_ON,
): CalendarDate {
  const weekday = weekdayOfCalendarDate(date);
  // `+ 7` antes do módulo: o resto de negativo em JavaScript mantém o sinal.
  const daysSinceStart = (weekday - weekStartsOn + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  return addDaysToCalendarDate(date, -daysSinceStart);
}

/** Último dia da semana, INCLUSIVO. */
export function endOfWeek(
  date: CalendarDate,
  weekStartsOn: Weekday = WEEK_STARTS_ON,
): CalendarDate {
  return addDaysToCalendarDate(startOfWeek(date, weekStartsOn), DAYS_IN_WEEK - 1);
}

/** Os sete dias da semana, em ordem, a partir de um início já normalizado. */
export function weekDays(weekStart: CalendarDate): CalendarDate[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) =>
    addDaysToCalendarDate(weekStart, index),
  );
}

export function addWeeks(weekStart: CalendarDate, weeks: number): CalendarDate {
  return addDaysToCalendarDate(weekStart, weeks * DAYS_IN_WEEK);
}

/**
 * Quantas semanas separam duas datas — a distância entre as SEMANAS que as
 * contêm, não `dias / 7`.
 *
 * A distinção importa: com a semana começando na segunda, sábado e domingo
 * distam 1 dia e 1 semana. Normalizar os dois lados com `startOfWeek` antes de
 * dividir é o que torna a conta exata — a diferença entre dois inícios de
 * semana é sempre múltipla de 7, e `daysBetweenCalendarDates` conta em UTC,
 * sem transição de horário de verão no caminho.
 */
export function weeksBetween(
  from: CalendarDate,
  to: CalendarDate,
  weekStartsOn: Weekday = WEEK_STARTS_ON,
): number {
  const days = daysBetweenCalendarDates(
    startOfWeek(from, weekStartsOn),
    startOfWeek(to, weekStartsOn),
  );
  return days / DAYS_IN_WEEK;
}

/**
 * Intervalo de instantes que a semana cobre, no fuso do usuário.
 *
 * Reaproveita `calendarRangeInTimeZone`, então a semana com transição de
 * horário de verão tem 167 ou 169 horas — nunca 168 assumidas.
 */
export function weekRangeInTimeZone(weekStart: CalendarDate, timeZone: string): InstantRange {
  return calendarRangeInTimeZone(weekStart, endOfWeek(weekStart), timeZone);
}

/**
 * Rótulo da semana: "25 – 31 de agosto", "29 de set – 5 de out",
 * "29 de dez de 2026 – 4 de jan de 2027".
 *
 * As três formas existem porque a semana atravessa mês e ano. A escolha é feita
 * comparando os COMPONENTES das duas datas, não recortando strings formatadas —
 * é isso que evita a concatenação frágil que quebra em dezembro.
 */
export function formatWeekRange(weekStart: CalendarDate, locale = "pt-BR"): string {
  const weekEnd = endOfWeek(weekStart);

  const sameYear = weekStart.slice(0, 4) === weekEnd.slice(0, 4);
  const sameMonth = sameYear && weekStart.slice(5, 7) === weekEnd.slice(5, 7);

  if (sameMonth) {
    const day = (date: CalendarDate) => formatCalendarDate(date, { day: "numeric" }, locale);
    const month = formatCalendarDate(weekStart, { month: "long" }, locale);
    return `${day(weekStart)} – ${day(weekEnd)} de ${month}`;
  }

  const short = (date: CalendarDate) =>
    formatCalendarDate(
      date,
      sameYear
        ? { day: "numeric", month: "short" }
        : { day: "numeric", month: "short", year: "numeric" },
      locale,
    );

  return `${short(weekStart)} – ${short(weekEnd)}`;
}

/**
 * Um pedaço de um bloco dentro de UM dia da grade.
 *
 * Existe só para apresentação: um bloco 23:00 → 01:00 é UMA linha no banco e
 * vira DOIS segmentos na tela (segunda 23:00–24:00, terça 00:00–01:00). Nada
 * aqui cria, duplica ou persiste entidade.
 */
export type DaySegment = LaneEntry & {
  /** Id do ScheduleBlock de origem — vários segmentos podem compartilhá-lo. */
  readonly blockId: string;
  /** Dia da grade em que este pedaço aparece. */
  readonly date: CalendarDate;
  /** Minutos do relógio local desde 00:00. `endMinute` chega a 1440. */
  readonly startMinute: number;
  readonly endMinute: number;
  /** O bloco começou antes deste dia. */
  readonly continuesBefore: boolean;
  /** O bloco continua depois deste dia. */
  readonly continuesAfter: boolean;
};

/**
 * Recorta um bloco nos dias que ele toca, em minutos do relógio local.
 *
 * A iteração é feita em DATAS CIVIS (`addDaysToCalendarDate`), nunca somando
 * 24 h em milissegundos — é isso que mantém a função correta em dia de
 * transição de horário de verão.
 *
 * Um fim exatamente à meia-noite pertence ao dia anterior, às 24:00, e não
 * gera um segmento vazio no dia seguinte.
 */
export function segmentBlockByDay<T extends Interval & { readonly id: string }>(
  block: T,
  timeZone: string,
): DaySegment[] {
  const startDate = toCalendarDateInTimeZone(block.startsAt, timeZone);
  const startMinute = timeOfDayToMinutes(timeOfDayInTimeZone(block.startsAt, timeZone));

  const rawEndDate = toCalendarDateInTimeZone(block.endsAt, timeZone);
  const rawEndMinute = timeOfDayToMinutes(timeOfDayInTimeZone(block.endsAt, timeZone));

  // Meia-noite em ponto fecha o dia anterior às 24:00.
  const endsAtMidnight = rawEndMinute === 0 && rawEndDate !== startDate;
  const endDate = endsAtMidnight ? addDaysToCalendarDate(rawEndDate, -1) : rawEndDate;
  const endMinute = endsAtMidnight ? MINUTES_PER_DAY : rawEndMinute;

  const segments: DaySegment[] = [];

  for (let date = startDate; date <= endDate; date = addDaysToCalendarDate(date, 1)) {
    const isFirst = date === startDate;
    const isLast = date === endDate;

    const from = isFirst ? startMinute : 0;
    const to = isLast ? endMinute : MINUTES_PER_DAY;

    if (to <= from) continue;

    segments.push({
      id: isFirst ? block.id : `${block.id}@${date}`,
      blockId: block.id,
      date,
      startMinute: from,
      endMinute: to,
      continuesBefore: !isFirst,
      continuesAfter: !isLast,
    });
  }

  return segments;
}

export type WeekWindow = {
  /** Minuto do relógio em que a grade começa. */
  readonly startMinute: number;
  /** Minuto do relógio em que a grade termina, exclusivo. */
  readonly endMinute: number;
  readonly totalMinutes: number;
};

/** Faixa útil padrão da grade — a mesma da tela Hoje. */
export const DEFAULT_WEEK_START_MINUTE = 6 * 60;
export const DEFAULT_WEEK_END_MINUTE = 23 * 60;

const MINUTES_PER_HOUR = 60;

/**
 * Faixa de horas visível, expandida (em horas cheias) para conter tudo o que
 * foi planejado na semana. Nenhum bloco fica fora da grade — a janela padrão
 * só decide onde ela ABRE, nunca o que ela esconde.
 */
export function buildWeekWindow(
  segments: readonly DaySegment[],
  options: {
    readonly startMinute?: number;
    readonly endMinute?: number;
  } = {},
): WeekWindow {
  let startMinute = options.startMinute ?? DEFAULT_WEEK_START_MINUTE;
  let endMinute = Math.max(
    options.endMinute ?? DEFAULT_WEEK_END_MINUTE,
    startMinute + MINUTES_PER_HOUR,
  );

  for (const segment of segments) {
    startMinute = Math.min(
      startMinute,
      Math.floor(segment.startMinute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR,
    );
    endMinute = Math.max(
      endMinute,
      Math.ceil(segment.endMinute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR,
    );
  }

  startMinute = Math.max(0, startMinute);
  endMinute = Math.min(MINUTES_PER_DAY, endMinute);

  return { startMinute, endMinute, totalMinutes: endMinute - startMinute };
}

/** Marcas de hora da régua da semana, em minutos do relógio. */
export function weekHourMarks(window: WeekWindow): number[] {
  const marks: number[] = [];
  const first = Math.ceil(window.startMinute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;

  for (let minute = first; minute <= window.endMinute; minute += MINUTES_PER_HOUR) {
    marks.push(minute);
  }

  return marks;
}

/** Minutos planejados em um dia, somando os segmentos visíveis nele. */
export function dayLoadMinutes(segments: readonly DaySegment[], date: CalendarDate): number {
  return segments
    .filter((segment) => segment.date === date)
    .reduce((total, segment) => total + (segment.endMinute - segment.startMinute), 0);
}
