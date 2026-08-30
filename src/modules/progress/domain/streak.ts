import { addDaysToCalendarDate, daysBetweenCalendarDates, type CalendarDate } from "@/lib/time";

import type { ActivityByDate } from "./activity";

/**
 * Sequências — consistência, não intensidade.
 *
 * O heatmap responde "quanto"; a sequência responde "seguido". São dimensões
 * diferentes de propósito, e por isso **qualquer conclusão faz o dia contar**,
 * sem mínimo de minutos.
 *
 * Exigir, digamos, 30 minutos por dia pareceria mais rigoroso e produziria o
 * incentivo errado: a maneira mais fácil de bater a régua não é trabalhar
 * mais, é inflar a estimativa da tarefa. Uma métrica que pode ser satisfeita
 * mentindo para si mesmo não mede nada.
 */

function isActive(activity: ActivityByDate, date: CalendarDate): boolean {
  const day = activity.get(date);
  return day !== undefined && day.minutes > 0;
}

/**
 * Sequência atual, em dias.
 *
 * ## A regra que evita o "streak zerado às 9 da manhã"
 *
 * Um dia só quebra a sequência depois de TERMINAR sem atividade. Se ontem
 * fechou dez dias seguidos e hoje ainda são nove da manhã, a sequência é dez —
 * não zero. O dia de hoje ainda está acontecendo, e anunciar a perda de algo
 * que a pessoa ainda pode fazer seria uma punição inventada pela interface.
 *
 * Daí a âncora: hoje quando hoje já tem conclusão, ontem caso contrário. A
 * contagem então caminha para trás enquanto encontrar dias ativos.
 */
export function currentStreak(activity: ActivityByDate, today: CalendarDate): number {
  const anchor = isActive(activity, today) ? today : addDaysToCalendarDate(today, -1);

  let streak = 0;
  for (let date = anchor; isActive(activity, date); date = addDaysToCalendarDate(date, -1)) {
    streak += 1;
  }

  return streak;
}

/**
 * Maior sequência dentro dos dados fornecidos.
 *
 * **O alcance é o dos dados, não "de todos os tempos".** Se a consulta trouxe
 * doze meses, isto é a melhor sequência de doze meses — e uma sequência que
 * começou antes da janela aparece truncada na borda. Quem exibe precisa dizer
 * o período; anunciar um recorde histórico sobre uma janela parcial seria
 * simplesmente falso.
 */
export function bestStreak(activity: ActivityByDate): number {
  // ISO "AAAA-MM-DD" ordena lexicograficamente na mesma ordem que
  // cronologicamente — não é preciso converter nada para Date aqui.
  const dates = [...activity.keys()]
    .filter((date) => isActive(activity, date))
    .sort();

  let best = 0;
  let run = 0;
  let previous: CalendarDate | null = null;

  for (const date of dates) {
    run = previous !== null && daysBetweenCalendarDates(previous, date) === 1 ? run + 1 : 1;
    previous = date;
    if (run > best) best = run;
  }

  return best;
}
