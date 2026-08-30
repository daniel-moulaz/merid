import {
  addDaysToCalendarDate,
  compareCalendarDates,
  type CalendarDate,
} from "@/lib/time";

import type { Task } from "./task";

/**
 * Agrupamento da Inbox por prazo — puro, sem React.
 *
 * ## Por que a lista precisava de seções
 *
 * A Inbox mostrava todas as tarefas abertas em uma lista contínua ordenada por
 * prioridade. Isso responde "o que é importante?", mas não responde a pergunta
 * que a pessoa realmente traz para uma caixa de entrada: "o que está pegando
 * fogo e o que pode esperar?". Uma tarefa urgente sem prazo aparecia acima de
 * uma tarefa média que venceu ontem — e vencida é uma condição mais dura que
 * prioridade alta, porque já custou alguma coisa.
 *
 * Com seções, o prazo passa a ser o eixo e a prioridade continua ordenando
 * DENTRO de cada seção. As duas informações param de competir.
 *
 * ## As fronteiras
 *
 * Todas em DATA CIVIL, no fuso do usuário, comparadas como string — que é o que
 * `CalendarDate` permite fazer com segurança. Nenhuma conta com `Date`, nenhuma
 * soma de 24 h: um agrupamento que escorregasse em dia de horário de verão
 * colocaria a tarefa na seção errada justamente no dia em que a pessoa mais
 * precisa confiar na agenda.
 *
 * "Próximos dias" é uma janela ROLANTE de sete dias a partir de hoje, e não a
 * semana do calendário: numa sexta-feira, "esta semana" com fronteira no
 * domingo conteria dois dias e a seção perderia o sentido. Por isso também o
 * rótulo não diz "esta semana" — ele descreve o que a seção é de verdade.
 */

export const TASK_GROUP_KEYS = [
  "OVERDUE",
  "TODAY",
  "TOMORROW",
  "THIS_WEEK",
  "LATER",
  "NO_DUE_DATE",
] as const;

export type TaskGroupKey = (typeof TASK_GROUP_KEYS)[number];

export const TASK_GROUP_LABEL: Record<TaskGroupKey, string> = {
  OVERDUE: "Atrasadas",
  TODAY: "Hoje",
  TOMORROW: "Amanhã",
  THIS_WEEK: "Próximos dias",
  LATER: "Mais adiante",
  NO_DUE_DATE: "Sem prazo",
};

export type TaskGroup = {
  readonly key: TaskGroupKey;
  readonly label: string;
  readonly tasks: readonly Task[];
};

/** Até quantos dias à frente de hoje ainda contam como "próximos dias". */
const UPCOMING_WINDOW_DAYS = 7;

/** Em que seção esta tarefa cai? */
export function taskGroupKey(
  task: Pick<Task, "dueDate">,
  today: CalendarDate,
): TaskGroupKey {
  if (task.dueDate === null) return "NO_DUE_DATE";

  const comparison = compareCalendarDates(task.dueDate, today);
  if (comparison < 0) return "OVERDUE";
  if (comparison === 0) return "TODAY";

  const tomorrow = addDaysToCalendarDate(today, 1);
  if (task.dueDate === tomorrow) return "TOMORROW";

  const horizon = addDaysToCalendarDate(today, UPCOMING_WINDOW_DAYS);
  return compareCalendarDates(task.dueDate, horizon) <= 0 ? "THIS_WEEK" : "LATER";
}

/**
 * Agrupa preservando a ordem recebida dentro de cada seção.
 *
 * A ordenação vem do servidor (prioridade, depois prazo, depois criação) e não
 * é refeita aqui: duas fontes de ordenação divergiriam na primeira vez que uma
 * das duas mudasse.
 *
 * Seções vazias não são devolvidas — um cabeçalho "Atrasadas" sobre nada seria
 * uma cobrança sem motivo.
 */
export function groupTasksByDue(
  tasks: readonly Task[],
  today: CalendarDate,
): TaskGroup[] {
  const buckets = new Map<TaskGroupKey, Task[]>();

  for (const task of tasks) {
    const key = taskGroupKey(task, today);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [task]);
    else bucket.push(task);
  }

  return TASK_GROUP_KEYS.flatMap((key) => {
    const bucket = buckets.get(key);
    if (bucket === undefined || bucket.length === 0) return [];
    return [{ key, label: TASK_GROUP_LABEL[key], tasks: bucket }];
  });
}
