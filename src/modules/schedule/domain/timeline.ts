import {
  dayRangeInTimeZone,
  instantFrom,
  minutesBetween,
  minutesToTimeOfDay,
  timeOfDayInTimeZone,
  type CalendarDate,
  type TimeOfDay,
} from "@/lib/time";

import { packIntoLanes } from "./lane-packing";
import { type Interval } from "./overlap";

/**
 * Modelo da timeline do dia — puro, sem pixel e sem React.
 *
 * Tudo aqui é expresso em MINUTOS DESDE O INÍCIO DO DIA do usuário, e não em
 * hora do relógio. A diferença aparece em dia de mudança de horário de verão:
 * o dia pode ter 1380 ou 1500 minutos, e um layout baseado na hora do relógio
 * abriria (ou comeria) uma hora de altura. Trabalhando em minutos reais a
 * proporção fica sempre correta; os RÓTULOS continuam sendo a hora do relógio,
 * que é o que o usuário reconhece.
 */

/** Janela útil padrão. Fora dela quase ninguém planeja — mas ver `buildTimelineWindow`. */
export const DEFAULT_TIMELINE_START: TimeOfDay = "06:00";
export const DEFAULT_TIMELINE_END: TimeOfDay = "23:00";

export const MINUTES_PER_HOUR = 60;

export type TimelineWindow = {
  /** Instante em que o dia começa para o usuário. Origem de todos os offsets. */
  readonly dayStartsAt: Date;
  /** Offset (min) do topo da janela. */
  readonly startMinute: number;
  /** Offset (min) da base da janela, exclusivo. */
  readonly endMinute: number;
  /** Duração da janela em minutos. Sempre positiva. */
  readonly totalMinutes: number;
  /** Duração do dia inteiro em minutos (1440, exceto em transições de fuso). */
  readonly dayMinutes: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Arredonda para baixo/cima na hora cheia mais próxima. */
function floorToHour(minute: number): number {
  return Math.floor(minute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
}

function ceilToHour(minute: number): number {
  return Math.ceil(minute / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
}

/**
 * Janela do dia, expandida para caber tudo o que foi planejado.
 *
 * Começa em 06:00–23:00 e cresce (em horas cheias) até conter cada bloco do
 * dia, sem nunca sair do próprio dia. Assim o caso comum abre já na região
 * útil, sem scroll perdido na madrugada, e um bloco às 05:00 ou às 23:40 não
 * fica invisível.
 */
export function buildTimelineWindow(
  date: CalendarDate,
  timeZone: string,
  blocks: readonly Interval[] = [],
  options: {
    readonly startTime?: TimeOfDay;
    readonly endTime?: TimeOfDay;
  } = {},
): TimelineWindow {
  const { start: dayStartsAt, endExclusive } = dayRangeInTimeZone(date, timeZone);
  const dayMinutes = minutesBetween(dayStartsAt, endExclusive);

  const toOffset = (instant: Date): number =>
    clamp(minutesBetween(dayStartsAt, instant), 0, dayMinutes);

  const defaultStart = toOffset(
    instantFrom(date, options.startTime ?? DEFAULT_TIMELINE_START, timeZone),
  );
  const defaultEnd = toOffset(
    instantFrom(date, options.endTime ?? DEFAULT_TIMELINE_END, timeZone),
  );

  let startMinute = defaultStart;
  let endMinute = Math.max(defaultEnd, defaultStart + MINUTES_PER_HOUR);

  for (const block of blocks) {
    // Blocos que atravessam a meia-noite entram recortados no dia visível.
    const blockStart = toOffset(block.startsAt);
    const blockEnd = toOffset(block.endsAt);
    if (blockEnd <= blockStart) continue;

    startMinute = Math.min(startMinute, floorToHour(blockStart));
    endMinute = Math.max(endMinute, ceilToHour(blockEnd));
  }

  startMinute = clamp(startMinute, 0, dayMinutes);
  endMinute = clamp(endMinute, startMinute + MINUTES_PER_HOUR, dayMinutes);

  return {
    dayStartsAt,
    startMinute,
    endMinute,
    totalMinutes: endMinute - startMinute,
    dayMinutes,
  };
}

/** Offset em minutos de um instante dentro do dia da janela. */
export function minuteOffsetInWindow(instant: Date, window: TimelineWindow): number {
  return minutesBetween(window.dayStartsAt, instant);
}

export type HourMark = {
  /** Offset em minutos desde o início do dia. */
  readonly minute: number;
  /** Rótulo no relógio do usuário, ex. "09:00". */
  readonly label: TimeOfDay;
};

/**
 * Marcas de hora da régua.
 *
 * O rótulo vem do INSTANTE convertido para o fuso do usuário, não de uma conta
 * de horas. Em um dia de mudança de horário de verão a régua honestamente pula
 * (01:00 → 03:00) em vez de desalinhar os blocos.
 */
export function hourMarks(window: TimelineWindow, timeZone: string): HourMark[] {
  const marks: HourMark[] = [];
  const first = ceilToHour(window.startMinute);

  for (let minute = first; minute <= window.endMinute; minute += MINUTES_PER_HOUR) {
    const instant = new Date(window.dayStartsAt.getTime() + minute * 60_000);
    marks.push({ minute, label: timeOfDayInTimeZone(instant, timeZone) });
  }

  return marks;
}

export type PositionedBlock<T> = {
  readonly item: T;
  /** Offsets já recortados à janela — é o que a UI posiciona. */
  readonly startMinute: number;
  readonly endMinute: number;
  /** Coluna ocupada dentro do grupo de blocos sobrepostos (base 0). */
  readonly lane: number;
  /** Quantas colunas o grupo precisou. Largura do card = 1 / laneCount. */
  readonly laneCount: number;
  /** `true` quando este bloco realmente sobrepõe algum outro. */
  readonly hasConflict: boolean;
};

/**
 * Posiciona os blocos do dia e os distribui em colunas.
 *
 * Os minutos aqui são DECORRIDOS desde o início do dia do usuário — é o que
 * mantém a proporção correta em dia de horário de verão, quando o dia tem 23
 * ou 25 horas. O empacotamento em colunas em si vive em `lane-packing.ts`,
 * compartilhado com a grade semanal, que deriva seus minutos de outra forma.
 *
 * Blocos que atravessam a meia-noite entram recortados na janela do dia; o
 * resto deles aparece no dia seguinte.
 */
export function layoutBlocks<T extends Interval & { readonly id: string }>(
  blocks: readonly T[],
  window: TimelineWindow,
): PositionedBlock<T>[] {
  const entries = blocks.map((item) => ({
    id: item.id,
    item,
    startMinute: clamp(
      minuteOffsetInWindow(item.startsAt, window),
      window.startMinute,
      window.endMinute,
    ),
    endMinute: clamp(
      minuteOffsetInWindow(item.endsAt, window),
      window.startMinute,
      window.endMinute,
    ),
  }));

  return packIntoLanes(entries).map(
    ({ item, startMinute, endMinute, lane, laneCount, hasConflict }) => ({
      item,
      startMinute,
      endMinute,
      lane,
      laneCount,
      hasConflict,
    }),
  );
}

/**
 * Rótulo de um offset como hora do relógio. Exato apenas em dias sem transição
 * de fuso; para exibir a régua use `hourMarks`, que converte o instante.
 */
export function offsetToApproximateTimeOfDay(minute: number): TimeOfDay {
  return minutesToTimeOfDay(minute);
}
