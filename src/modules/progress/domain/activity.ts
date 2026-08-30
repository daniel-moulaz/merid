import type { CalendarDate } from "@/lib/time";

/**
 * Atividade concluída — puro, sem pixel e sem React.
 *
 * ## O que "atividade" significa neste produto
 *
 * Só conta trabalho CONCLUÍDO. Abrir o app, criar tarefa e planejar bloco não
 * entram: planejar não é executar, e um heatmap que acende ao planejar mediria
 * intenção, não ritmo.
 *
 * O peso do dia são os `estimatedMinutes` das tarefas concluídas nele. Contar
 * tarefas trataria 5 minutos e 3 horas como a mesma coisa, o que apaga a
 * informação mais útil que o modelo tem.
 *
 * **O limite disso, dito com todas as letras:** `estimatedMinutes` é uma
 * ESTIMATIVA, não tempo medido. O produto não rastreia tempo real, e inventar
 * esse rastreio seria outro produto. Por isso a interface nunca diz "2h15
 * concluídas" — que afirmaria trabalho executado — e sim "2h15 em tarefas
 * concluídas", que é exatamente o que o dado sustenta.
 */

/** Um dia com atividade, já agregado. Dias sem atividade não aparecem. */
export type DayActivity = {
  readonly date: CalendarDate;
  /** Soma dos `estimatedMinutes` das tarefas concluídas no dia. */
  readonly minutes: number;
  readonly tasks: number;
};

/** Índice de dia → atividade. Ausência significa "nenhuma conclusão". */
export type ActivityByDate = ReadonlyMap<CalendarDate, DayActivity>;

export function indexActivityByDate(days: readonly DayActivity[]): ActivityByDate {
  return new Map(days.map((day) => [day.date, day]));
}

/**
 * Intensidade de um dia, de 0 a 4.
 *
 * ## Por que faixas absolutas e não relativas ao próprio histórico
 *
 * Faixas relativas (percentis) parecem mais "justas" e são uma armadilha: um
 * dia excepcional sobe a régua, e dias idênticos aos de antes passam a pintar
 * mais fraco. O gráfico puniria progresso. Além disso ninguém consegue
 * explicar por que dois dias iguais receberam cores diferentes.
 *
 * Absolutas são estáveis e explicáveis: 45 minutos pintam igual em janeiro e
 * em dezembro, no primeiro mês de uso e no terceiro ano.
 *
 * ## Por que o primeiro nível começa em 1 minuto
 *
 * Qualquer conclusão precisa ACENDER a célula. Um dia de 20 minutos é um dia
 * em que a pessoa avançou; deixá-lo visualmente idêntico a um dia vazio
 * transformaria o mapa em julgamento, que é justamente o que ele não deve ser.
 *
 * ## Por que o topo satura em 2 horas
 *
 * Concluir uma tarefa de 4 horas de uma vez gera um pico enorme. A saturação
 * já resolve isso onde importa — a célula: 2h e 4h pintam igual. Achatar a
 * MÉTRICA com um teto artificial acrescentaria uma constante mágica que a
 * pessoa não entende e distorceria os totais da semana, que são somas honestas.
 */
export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

/** Piso de minutos de cada nível, do mais intenso para o mais leve. */
const LEVEL_FLOORS: readonly (readonly [ActivityLevel, number])[] = [
  [4, 120],
  [3, 60],
  [2, 30],
  [1, 1],
];

export function activityLevel(minutes: number): ActivityLevel {
  for (const [level, floor] of LEVEL_FLOORS) {
    if (minutes >= floor) return level;
  }
  return 0;
}

/** Descrição da faixa, para legenda e leitor de tela. */
export function activityLevelLabel(level: ActivityLevel): string {
  switch (level) {
    case 0:
      return "sem conclusões";
    case 1:
      return "até 30 min";
    case 2:
      return "30 min a 1h";
    case 3:
      return "1h a 2h";
    case 4:
      return "2h ou mais";
  }
}

/** Totais de um conjunto de dias — usado pelo resumo da semana. */
export type ActivityTotals = {
  readonly minutes: number;
  readonly tasks: number;
  /** Dias com pelo menos uma conclusão. */
  readonly activeDays: number;
};

export function totalsFor(
  dates: readonly CalendarDate[],
  activity: ActivityByDate,
): ActivityTotals {
  let minutes = 0;
  let tasks = 0;
  let activeDays = 0;

  for (const date of dates) {
    const day = activity.get(date);
    if (day === undefined || day.minutes === 0) continue;

    minutes += day.minutes;
    tasks += day.tasks;
    activeDays += 1;
  }

  return { minutes, tasks, activeDays };
}
