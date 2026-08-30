import type { CalendarDate } from "@/lib/time";

/**
 * Chaves de cache da agenda.
 *
 * Módulo deliberadamente SEM IMPORTS de runtime: ele é importado também pelo
 * módulo de tarefas, que precisa invalidar a agenda quando uma tarefa é
 * excluída (o `on delete cascade` do banco leva os blocos junto) ou concluída
 * (o card do bloco mostra o estado da tarefa). Mantendo este arquivo sem
 * dependências, essa invalidação cruzada não cria ciclo entre os módulos.
 *
 * Como nas tarefas, o id do usuário faz parte da chave: mesmo que a limpeza de
 * cache no logout falhe, o cache de uma conta nunca é servido para outra.
 */
export const scheduleKeys = {
  all: (userId: string) => ["schedule", userId] as const,

  /** Um bloco específico — usado ao reagendar por link direto. */
  detail: (userId: string, id: string) => ["schedule", userId, "detail", id] as const,

  /**
   * Prefixo de TODA lista de blocos, de qualquer intervalo.
   *
   * Dia e semana compartilham este prefixo de propósito: é ele que permite uma
   * atualização otimista (remover da agenda, concluir) alcançar as duas telas
   * de uma vez, sem cada mutação precisar saber quais intervalos existem.
   */
  blocks: (userId: string) => ["schedule", userId, "blocks"] as const,

  /** Blocos que intersectam um dia do calendário do usuário. */
  day: (userId: string, date: CalendarDate) =>
    ["schedule", userId, "blocks", "day", date] as const,

  /** Blocos que intersectam a semana que começa em `weekStart`. */
  week: (userId: string, weekStart: CalendarDate) =>
    ["schedule", userId, "blocks", "week", weekStart] as const,

  /**
   * Blocos que intersectam a GRADE do mês — inclusive os dias vizinhos que
   * fecham a primeira e a última linha. Mesmo prefixo `blocks`, então uma
   * escrita otimista alcança o mês junto com o dia e a semana.
   */
  month: (userId: string, monthStart: CalendarDate) =>
    ["schedule", userId, "blocks", "month", monthStart] as const,

  /**
   * Ids das tarefas com bloco de hoje em diante — é o complemento da lista de
   * "não agendadas". A chave inclui o dia porque a fronteira é o início de hoje.
   */
  scheduledTaskIds: (userId: string, today: CalendarDate) =>
    ["schedule", userId, "scheduled-task-ids", today] as const,
};
