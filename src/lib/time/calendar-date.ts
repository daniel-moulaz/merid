/**
 * Data civil ("YYYY-MM-DD"): um dia do calendário, SEM horário e SEM timezone.
 *
 * É o tipo de `Task.dueDate` ("preciso terminar até sexta") e a chave de dia do
 * heatmap/streak. Um prazo não tem hora: representá-lo como instante é a origem
 * clássica do bug "a tarefa mudou de dia".
 *
 * Regra: nenhum `Date` que represente uma data civil deve circular pelo app.
 * A conversão para/de `Date` acontece apenas na fronteira do banco
 * (`calendarDateToUtcDate` / `utcDateToCalendarDate`).
 */
export type CalendarDate = string;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Menor ano aceito. Abaixo de 1000 o `Date.UTC` remapeia anos de 2 dígitos. */
const MIN_YEAR = 1000;

/**
 * Valida o formato E a existência do dia: "2026-02-30" é rejeitado.
 */
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== "string") return false;

  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < MIN_YEAR) return false;

  // Round-trip: se o dia não existe, o Date normaliza para outro e a comparação falha.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Converte para `CalendarDate` ou lança. Use na fronteira de entrada. */
export function assertCalendarDate(value: unknown): CalendarDate {
  if (!isCalendarDate(value)) {
    throw new TypeError(`Data civil inválida: ${String(value)}`);
  }
  return value;
}

/**
 * `CalendarDate` -> `Date` para gravar em coluna `date` do Postgres.
 * O Prisma serializa colunas `date` pelos componentes UTC, então ancoramos a
 * data à meia-noite UTC. Este `Date` NÃO representa um instante real do dia do
 * usuário e não deve ser usado para nada além de I/O com o banco.
 */
export function calendarDateToUtcDate(value: CalendarDate): Date {
  const date = assertCalendarDate(value);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * `Date` vindo de uma coluna `date` -> `CalendarDate`, lendo componentes UTC.
 * Ler com `getFullYear()` (local) aqui é exatamente o bug de "um dia a menos".
 */
export function utcDateToCalendarDate(value: Date): CalendarDate {
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Soma dias (aceita negativos), preservando a semântica civil. */
export function addDaysToCalendarDate(value: CalendarDate, days: number): CalendarDate {
  if (!Number.isInteger(days)) {
    throw new TypeError(`days precisa ser inteiro, recebido: ${days}`);
  }
  const date = calendarDateToUtcDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateToCalendarDate(date);
}

/**
 * Dia da semana de uma data civil: 0 = domingo … 6 = sábado.
 *
 * Lido pelos componentes UTC do ancoramento, nunca por `getDay()` local — uma
 * data civil não tem fuso, e usar o relógio da máquina aqui é o bug clássico
 * de "a semana começou no dia errado".
 */
export function weekdayOfCalendarDate(value: CalendarDate): number {
  return calendarDateToUtcDate(value).getUTCDay();
}

/** Diferença em dias (b - a). */
export function daysBetweenCalendarDates(a: CalendarDate, b: CalendarDate): number {
  const MS_PER_DAY = 86_400_000;
  const diff = calendarDateToUtcDate(b).getTime() - calendarDateToUtcDate(a).getTime();
  return Math.round(diff / MS_PER_DAY);
}

/** Comparação cronológica. O formato ISO torna a ordem lexicográfica correta. */
export function compareCalendarDates(a: CalendarDate, b: CalendarDate): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Formata para exibição (ex.: "29 de ago"). Puro: a data civil não tem timezone. */
export function formatCalendarDate(
  value: CalendarDate,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" },
  locale = "pt-BR",
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    // Obrigatório: sem isso o Intl aplicaria o timezone da máquina e poderia
    // exibir o dia anterior.
    timeZone: "UTC",
  }).format(calendarDateToUtcDate(value));
}

/**
 * Data por extenso no padrão brasileiro: "30/08/2026".
 *
 * O domínio, o banco e o transporte continuam em ISO (`AAAA-MM-DD`) — é o que
 * torna `CalendarDate` comparável como string e ordenável sem conversão. Este
 * helper existe para a fronteira oposta: TUDO o que a pessoa lê ou digita usa
 * o formato do país dela.
 *
 * Ter uma função nomeada, em vez de espalhar `{ day, month, year }` pelas
 * telas, é o que garante que o formato seja o mesmo em todo lugar — e que
 * mudá-lo um dia seja uma edição só.
 */
export function formatCalendarDateBR(value: CalendarDate): string {
  return formatCalendarDate(value, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
