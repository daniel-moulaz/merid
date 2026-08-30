import {
  addDaysToCalendarDate,
  assertCalendarDate,
  weekdayOfCalendarDate,
  type CalendarDate,
} from "./calendar-date";

/**
 * A grade de um mês — aritmética de calendário pura.
 *
 * ## Por que mora em `lib/time` e não no módulo da agenda
 *
 * Estas funções não sabem o que é um bloco, uma tarefa ou um fuso: são a mesma
 * conta de calendário que qualquer produto faria. E agora existem DOIS
 * consumidores em módulos diferentes — a visão de mês da agenda e o mini
 * calendário de `ui/`, que é um componente genérico e não pode depender de um
 * módulo de feature. Quando um cálculo puro passa a servir dois lados, o lugar
 * dele é a base.
 *
 * A camada que precisa de fuso (`monthRangeInTimeZone`) continua no módulo da
 * agenda, porque ali ela realmente é sobre consultar blocos.
 *
 * ## O primeiro dia da semana é parâmetro
 *
 * O produto começa a semana na segunda (`WEEK_STARTS_ON`), mas quem decide isso
 * é o módulo da agenda, não a base. Aqui é um argumento com padrão, o que
 * também deixa a função testável nas duas convenções sem tocar em nada.
 */

/**
 * Rótulos das colunas, na ordem de `DEFAULT_WEEK_STARTS_ON`.
 *
 * Três letras e não uma: em português "S" serve a segunda e a sábado, e "Q" a
 * quarta e a quinta — uma inicial só torna a grade ambígua justamente onde ela
 * precisa ser lida de relance.
 */
export const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"] as const;

/** 0 = domingo … 6 = sábado, como em `Date.getUTCDay`. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAYS_IN_GRID_WEEK = 7;

/** Padrão do produto: a semana começa na segunda-feira. */
export const DEFAULT_WEEK_STARTS_ON: WeekdayIndex = 1;

/** Volta até o primeiro dia da semana que contém `date`. */
export function startOfGridWeek(
  date: CalendarDate,
  weekStartsOn: WeekdayIndex = DEFAULT_WEEK_STARTS_ON,
): CalendarDate {
  const weekday = weekdayOfCalendarDate(date);
  const back = (weekday - weekStartsOn + DAYS_IN_GRID_WEEK) % DAYS_IN_GRID_WEEK;
  return addDaysToCalendarDate(date, -back);
}

/** Primeiro dia do mês a que a data pertence. */
export function startOfMonth(date: CalendarDate): CalendarDate {
  return assertCalendarDate(`${date.slice(0, 7)}-01`);
}

/**
 * Soma meses preservando o dia 1.
 *
 * A conta é feita em ano/mês e nunca em milissegundos: somar 30 dias erra em
 * fevereiro e nos meses de 31, e somar 24 h por dia erra em transição de fuso.
 */
export function addMonths(monthStart: CalendarDate, months: number): CalendarDate {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7));

  const zeroBased = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = zeroBased - nextYear * 12 + 1;

  return assertCalendarDate(
    `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`,
  );
}

/** Quantos meses separam os dois — positivo quando `to` é posterior. */
export function monthsBetween(from: CalendarDate, to: CalendarDate): number {
  const fromValue = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const toValue = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  return toValue - fromValue;
}

export type MonthCell = {
  readonly date: CalendarDate;
  /** `false` para os dias vizinhos que só existem para fechar a linha. */
  readonly inMonth: boolean;
};

/**
 * As células da grade, em ordem.
 *
 * Sempre um múltiplo de sete. O número de linhas varia entre 4 e 6 conforme o
 * mês — um fevereiro não bissexto que comece no primeiro dia da semana ocupa
 * exatamente 4; um mês de 31 dias que comece no último ocupa 6. A grade
 * acompanha em vez de reservar altura fixa para o pior caso.
 */
export function monthCells(
  monthStart: CalendarDate,
  weekStartsOn: WeekdayIndex = DEFAULT_WEEK_STARTS_ON,
): MonthCell[] {
  const month = monthStart.slice(0, 7);
  const first = startOfGridWeek(monthStart, weekStartsOn);

  // O último dia do mês é a véspera do dia 1 do mês seguinte.
  const lastOfMonth = addDaysToCalendarDate(addMonths(monthStart, 1), -1);
  const last = addDaysToCalendarDate(
    startOfGridWeek(lastOfMonth, weekStartsOn),
    DAYS_IN_GRID_WEEK - 1,
  );

  const cells: MonthCell[] = [];
  for (let date = first; date <= last; date = addDaysToCalendarDate(date, 1)) {
    cells.push({ date, inMonth: date.slice(0, 7) === month });
  }

  return cells;
}

/** As linhas da grade, de sete dias cada. */
export function monthWeeks(
  monthStart: CalendarDate,
  weekStartsOn: WeekdayIndex = DEFAULT_WEEK_STARTS_ON,
): MonthCell[][] {
  const cells = monthCells(monthStart, weekStartsOn);
  const weeks: MonthCell[][] = [];

  for (let index = 0; index < cells.length; index += DAYS_IN_GRID_WEEK) {
    weeks.push(cells.slice(index, index + DAYS_IN_GRID_WEEK));
  }

  return weeks;
}

/** "Agosto de 2026", com a primeira letra maiúscula. */
export function formatMonth(monthStart: CalendarDate, locale = "pt-BR"): string {
  const [year, month] = [monthStart.slice(0, 4), monthStart.slice(5, 7)];
  const label = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${year}-${month}-01T00:00:00.000Z`));

  return label.charAt(0).toUpperCase() + label.slice(1);
}
