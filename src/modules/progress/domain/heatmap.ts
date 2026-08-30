import {
  addDaysToCalendarDate,
  calendarRangeInTimeZone,
  formatCalendarDate,
  type CalendarDate,
  type InstantRange,
} from "@/lib/time";
// A convenção de início de semana é uma regra só, e ela já mora na Etapa 3.
// Reimplementar aqui criaria a chance de o heatmap começar na segunda e a
// agenda no domingo — a mesma pessoa vendo duas semanas diferentes.
import { addWeeks, DAYS_IN_WEEK, startOfWeek } from "@/modules/schedule/domain/week";

import { activityLevel, type ActivityByDate, type ActivityLevel } from "./activity";

/**
 * A grade do heatmap — puro, sem pixel e sem React.
 *
 * ## Uma janela de dados, várias fatias visuais
 *
 * A CONSULTA cobre sempre as últimas 53 semanas, independentemente do que a
 * tela desenha. É isso que permite dizer "melhor sequência dos últimos 12
 * meses" com uma frase verdadeira: se a janela encolhesse junto com a largura
 * da tela, o recorde da pessoa mudaria ao girar o telefone.
 *
 * O DESENHO usa uma fatia final dessa janela, do tamanho que couber. Menos
 * colunas no telefone, mais no desktop, sem nova requisição.
 */

/**
 * Semanas trazidas pela consulta. 53 × 7 = 371 dias: cobre doze meses inteiros
 * já alinhados ao início de semana, e mantém a resposta agregada em no máximo
 * 371 linhas — bem abaixo do corte do PostgREST.
 */
export const HEATMAP_HISTORY_WEEKS = 53;

/** Rótulo honesto do alcance dos dados. Ver `bestStreak`. */
export const HISTORY_LABEL = "nos últimos 12 meses";

export type HeatmapCell = {
  readonly date: CalendarDate;
  readonly minutes: number;
  readonly tasks: number;
  readonly level: ActivityLevel;
  /**
   * Dia que ainda não chegou.
   *
   * Futuro NÃO é zero. Um sábado que ainda não aconteceu não é um sábado sem
   * trabalho, e pintá-lo como célula vazia transformaria o resto da semana em
   * uma fileira de falhas antecipadas.
   */
  readonly isFuture: boolean;
  readonly isToday: boolean;
};

export type HeatmapWeek = {
  readonly start: CalendarDate;
  /** Sempre sete, do início de semana configurado em diante. */
  readonly days: readonly HeatmapCell[];
};

/** Primeiro e último dia da janela de dados, alinhados à semana. */
export function buildHeatmapRange(
  today: CalendarDate,
  weeks: number = HEATMAP_HISTORY_WEEKS,
): { readonly from: CalendarDate; readonly to: CalendarDate } {
  const currentWeekStart = startOfWeek(today);

  return {
    from: addWeeks(currentWeekStart, -(weeks - 1)),
    to: addDaysToCalendarDate(currentWeekStart, DAYS_IN_WEEK - 1),
  };
}

/**
 * Intervalo de instantes que a janela cobre, no fuso do usuário.
 *
 * Reaproveita `calendarRangeInTimeZone`, então uma janela que contém transição
 * de horário de verão não ganha nem perde uma hora por engano.
 */
export function heatmapInstantRange(
  today: CalendarDate,
  timeZone: string,
  weeks: number = HEATMAP_HISTORY_WEEKS,
): InstantRange {
  const { from, to } = buildHeatmapRange(today, weeks);
  return calendarRangeInTimeZone(from, to, timeZone);
}

/**
 * As semanas visíveis, da mais antiga para a mais recente.
 *
 * A última é sempre a semana de hoje, inteira: os dias posteriores a hoje
 * aparecem marcados como futuros em vez de serem omitidos, para que a linha
 * do tempo não termine num degrau irregular.
 */
export function buildHeatmapWeeks({
  today,
  weeks,
  activity,
}: {
  readonly today: CalendarDate;
  readonly weeks: number;
  readonly activity: ActivityByDate;
}): HeatmapWeek[] {
  const { from } = buildHeatmapRange(today, weeks);

  return Array.from({ length: weeks }, (_, index) => {
    const start = addWeeks(from, index);

    return {
      start,
      days: Array.from({ length: DAYS_IN_WEEK }, (_, offset) => {
        const date = addDaysToCalendarDate(start, offset);
        const day = activity.get(date);
        const minutes = day?.minutes ?? 0;

        return {
          date,
          minutes,
          tasks: day?.tasks ?? 0,
          level: activityLevel(minutes),
          isFuture: date > today,
          isToday: date === today,
        };
      }),
    };
  });
}

/** Todas as datas das semanas, achatadas — para somar totais de um período. */
export function datesOf(weeks: readonly HeatmapWeek[]): CalendarDate[] {
  return weeks.flatMap((week) => week.days.map((day) => day.date));
}

export type MonthLabel = {
  /** Índice da semana onde o mês começa a aparecer. */
  readonly weekIndex: number;
  readonly label: string;
};

/**
 * Marcas de mês para o eixo do heatmap.
 *
 * Uma marca por mês, na primeira semana em que aquele mês aparece — e a
 * primeira semana é pulada quando ela mostraria um mês que já está terminando,
 * o que produziria dois rótulos colados na borda esquerda.
 */
export function monthLabels(weeks: readonly HeatmapWeek[], locale = "pt-BR"): MonthLabel[] {
  const labels: MonthLabel[] = [];
  let lastMonth = "";

  weeks.forEach((week, weekIndex) => {
    // O mês da semana é o do seu ponto médio: uma semana que começa em 30 de
    // março e termina em 5 de abril pertence visualmente a abril.
    const middle = addDaysToCalendarDate(week.start, 3);
    const month = middle.slice(0, 7);
    if (month === lastMonth) return;

    lastMonth = month;
    if (weekIndex === 0) return;

    labels.push({
      weekIndex,
      label: formatCalendarDate(middle, { month: "short" }, locale).replace(".", ""),
    });
  });

  return labels;
}
