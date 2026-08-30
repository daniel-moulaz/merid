import {
  calendarRangeInTimeZone,
  monthCells,
  type CalendarDate,
  type InstantRange,
} from "@/lib/time";

/**
 * A visão de mês da agenda.
 *
 * ## O que a visão de mês é, e o que ela não é
 *
 * Ela NÃO é a timeline com menos zoom. Um dia de mês tem uns 90 px de altura:
 * não cabe régua de horas, não cabe posicionar bloco por minuto, e tentar
 * espremer isso produziria faixas ilegíveis. O que cabe — e o que se procura
 * num mês — é DENSIDADE: em que dias há compromisso, quais estão cheios, onde
 * está o buraco. A pergunta do mês é "como está o mês", não "o que acontece às
 * 14:00"; para essa segunda existem o dia e a semana, a um toque de distância.
 *
 * ## Onde mora a aritmética
 *
 * A grade em si (`monthWeeks`, `addMonths`, `formatMonth`…) é calendário puro e
 * vive em `@/lib/time`, porque o mini calendário de `ui/` precisa exatamente da
 * mesma conta e é um componente genérico, que não pode depender deste módulo.
 * Aqui fica só o que é de fato sobre AGENDA: converter a grade em um intervalo
 * de instantes para consultar blocos.
 *
 * A reexportação abaixo mantém os consumidores da agenda importando de um lugar
 * só, sem precisar saber que a conta desceu uma camada.
 */

export {
  addMonths,
  formatMonth,
  monthCells,
  monthsBetween,
  monthWeeks,
  startOfMonth,
  WEEKDAY_LABELS,
  type MonthCell,
} from "@/lib/time";

/**
 * O intervalo de instantes que a grade inteira cobre — inclusive os dias
 * vizinhos, que também mostram carga.
 *
 * Uma consulta por mês, com o mesmo contrato de `weekRangeInTimeZone`: é o que
 * permite reaproveitar `fetchBlocksInRange` sem nenhuma consulta nova.
 */
export function monthRangeInTimeZone(
  monthStart: CalendarDate,
  timeZone: string,
): InstantRange {
  const cells = monthCells(monthStart);
  const first = cells[0]?.date ?? monthStart;
  const last = cells[cells.length - 1]?.date ?? monthStart;

  return calendarRangeInTimeZone(first, last, timeZone);
}
