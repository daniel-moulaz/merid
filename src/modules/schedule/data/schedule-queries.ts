import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { dayRangeInTimeZone, type CalendarDate } from "@/lib/time";
import { useAuth } from "@/modules/auth/auth-context";
import { useTimeZone, useToday } from "@/modules/profile/profile-queries";
import { setTaskCompletion } from "@/modules/tasks/data/task-repository";
import { taskKeys, useOpenTasks } from "@/modules/tasks/data/task-queries";
import {
  taskCompletionFields,
  taskReopenFields,
  type Task,
} from "@/modules/tasks/domain/task";

import {
  selectUnscheduledTasks,
  unscheduledBoundary,
  type ScheduleBlock,
  type ScheduleBlockWithTask,
} from "../domain/schedule-block";
import { monthRangeInTimeZone } from "../domain/month";
import { weekRangeInTimeZone } from "../domain/week";
import type {
  CreateScheduleBlockInput,
  UpdateScheduleBlockInput,
} from "../domain/schedule-schemas";
import { scheduleKeys } from "./schedule-keys";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  fetchBlocksInRange,
  fetchScheduleBlock,
  fetchScheduledTaskIds,
  updateScheduleBlock,
} from "./schedule-repository";

/**
 * Estado de servidor da agenda.
 *
 * O contrato da tela Hoje são TRÊS consultas, todas limitadas e nenhuma por
 * item:
 *
 *   1. blocos que intersectam o dia, com a tarefa embutida  (1 round-trip)
 *   2. ids das tarefas com bloco de hoje em diante          (só `task_id`)
 *   3. tarefas abertas                                      (já existia)
 *
 * A composição de "não agendadas" (1 e 3 cruzados por 2) acontece em memória,
 * com a regra vindo do domínio — nenhuma junção espalhada pela UI.
 *
 * A visão semanal reaproveita tudo isso: muda só o INTERVALO consultado. Uma
 * consulta por semana, nunca sete por dia.
 */

function invalidateSchedule(queryClient: QueryClient, userId: string): Promise<void> {
  return queryClient
    .invalidateQueries({ queryKey: scheduleKeys.all(userId) })
    .then(() => undefined);
}

/**
 * Mudar a agenda muda quem está "não agendada" — e essa lista é derivada das
 * tarefas. Por isso as escritas da agenda invalidam os dois lados.
 */
function invalidateScheduleAndTasks(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: scheduleKeys.all(userId) }),
    queryClient.invalidateQueries({ queryKey: taskKeys.all(userId) }),
  ]).then(() => undefined);
}

/** Blocos que intersectam o dia informado, com a tarefa de cada um. */
export function useDayBlocks(date: CalendarDate) {
  const { userId } = useAuth();
  const timeZone = useTimeZone();

  return useQuery({
    queryKey: scheduleKeys.day(userId ?? "anonymous", date),
    queryFn: () => fetchBlocksInRange(dayRangeInTimeZone(date, timeZone)),
    enabled: userId !== null,
  });
}

/**
 * Blocos que intersectam a semana, com a tarefa de cada um.
 *
 * `weekStart` precisa vir normalizado por `startOfWeek` — é a chave de cache,
 * e duas datas da mesma semana não podem gerar duas entradas diferentes.
 */
export function useWeekBlocks(weekStart: CalendarDate) {
  const { userId } = useAuth();
  const timeZone = useTimeZone();

  return useQuery({
    queryKey: scheduleKeys.week(userId ?? "anonymous", weekStart),
    queryFn: () => fetchBlocksInRange(weekRangeInTimeZone(weekStart, timeZone)),
    enabled: userId !== null,
  });
}

/**
 * Blocos que intersectam a grade do mês, com a tarefa de cada um.
 *
 * Uma consulta por mês, com o MESMO repositório do dia e da semana: o que muda
 * é só o intervalo. A visão de mês não precisou de consulta nova nem de um
 * agregado próprio — ela conta em memória o que já veio.
 *
 * `monthStart` precisa vir normalizado por `startOfMonth`: é a chave de cache,
 * e duas datas do mesmo mês não podem gerar duas entradas.
 */
export function useMonthBlocks(monthStart: CalendarDate) {
  const { userId } = useAuth();
  const timeZone = useTimeZone();

  return useQuery({
    queryKey: scheduleKeys.month(userId ?? "anonymous", monthStart),
    queryFn: () => fetchBlocksInRange(monthRangeInTimeZone(monthStart, timeZone)),
    enabled: userId !== null,
  });
}

/** Um bloco pelo id — a tela de reagendamento pode abrir sem a agenda em cache. */
export function useScheduleBlock(id: string | undefined) {
  const { userId } = useAuth();

  return useQuery({
    queryKey: scheduleKeys.detail(userId ?? "anonymous", id ?? "none"),
    queryFn:
      userId === null || id === undefined ? skipToken : () => fetchScheduleBlock(id),
  });
}

/**
 * Ids das tarefas que já têm horário de hoje em diante.
 *
 * A fronteira é o INÍCIO DO DIA, não `agora`: com granularidade de dia a chave
 * de cache é estável em vez de mudar a cada segundo. Ver `unscheduledBoundary`.
 */
export function useScheduledTaskIds() {
  const { userId } = useAuth();
  const timeZone = useTimeZone();
  const today = useToday();

  const query = useQuery({
    queryKey: scheduleKeys.scheduledTaskIds(userId ?? "anonymous", today),
    queryFn: () => fetchScheduledTaskIds(unscheduledBoundary(today, timeZone)),
    enabled: userId !== null,
  });

  const ids = query.data;
  const scheduledTaskIds = useMemo(() => new Set(ids ?? []), [ids]);

  return { ...query, scheduledTaskIds };
}

export type UnscheduledTasksResult = {
  readonly tasks: readonly Task[];
  readonly isPending: boolean;
  readonly isError: boolean;
  /**
   * A conta tem alguma tarefa aberta, agendada ou não.
   *
   * Distingue "acabei de criar a conta" de "já organizei tudo" — dois estados
   * vazios que pedem frases diferentes.
   */
  readonly hasAnyTask: boolean;
};

/**
 * Tarefas abertas que ainda precisam de horário.
 *
 * A REGRA mora no domínio (`selectUnscheduledTasks`); aqui só se junta o que
 * cada consulta trouxe. Enquanto os ids agendados não chegam, a lista aparece
 * vazia em vez de piscar tarefas que já têm horário.
 */
export function useUnscheduledTasks(): UnscheduledTasksResult {
  const openTasks = useOpenTasks();
  const scheduled = useScheduledTaskIds();

  const tasks = useMemo(
    () =>
      scheduled.isPending
        ? []
        : selectUnscheduledTasks(openTasks.data ?? [], scheduled.scheduledTaskIds),
    [openTasks.data, scheduled.isPending, scheduled.scheduledTaskIds],
  );

  return {
    tasks,
    isPending: openTasks.isPending || scheduled.isPending,
    isError: openTasks.isError || scheduled.isError,
    hasAnyTask: (openTasks.data ?? []).length > 0,
  };
}

/**
 * Criar bloco.
 *
 * Sem atualização otimista de propósito: o id vem do banco, a tela do
 * formulário fecha logo em seguida e a agenda é remontada com o dado real. Um
 * bloco temporário com id falso só adicionaria caminhos de rollback.
 */
export function useCreateScheduleBlock() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (input: CreateScheduleBlockInput) => createScheduleBlock(input),
    onSuccess: () =>
      userId === null ? undefined : invalidateScheduleAndTasks(queryClient, userId),
  });
}

type BlockCaches = readonly [readonly unknown[], ScheduleBlockWithTask[] | undefined][];

/**
 * Todas as listas de blocos já carregadas — de qualquer dia e de qualquer
 * semana —, para desfazer uma alteração otimista. É o prefixo comum
 * `scheduleKeys.blocks` que faz Hoje e Semana reagirem juntas.
 */
function snapshotBlockCaches(queryClient: QueryClient, userId: string): BlockCaches {
  return queryClient.getQueriesData<ScheduleBlockWithTask[]>({
    queryKey: scheduleKeys.blocks(userId),
  });
}

function restoreBlockCaches(queryClient: QueryClient, caches: BlockCaches): void {
  for (const [key, value] of caches) {
    queryClient.setQueryData(key, value);
  }
}

/**
 * Editar horário, reagendar e ARRASTAR são a mesma operação: um UPDATE do bloco.
 *
 * ## Por que esta é otimista, ao contrário da criação
 *
 * O arrasto termina quando o dedo levanta, e nesse instante o cartão volta a se
 * desenhar a partir do CACHE — o deslocamento visual do gesto já foi descartado.
 * Sem atualização otimista o bloco pulava de volta ao horário antigo e só
 * chegava ao novo quando o servidor respondesse: um "não funcionou" seguido de
 * um "ah, funcionou", justamente na interação mais frequente da agenda.
 *
 * O rollback é o mesmo mecanismo que remover e concluir já usavam — devolver os
 * intervalos que estavam em cache. É isso que sustenta a garantia de nunca
 * exibir um horário que o banco recusou: se a escrita falha, o bloco volta
 * sozinho para onde estava, e quem chamou mostra o erro.
 *
 * A correção só mexe nos INSTANTES. Um bloco arrastado para fora do dia
 * consultado continua aparecendo ali até a invalidação chegar — é uma janela de
 * milissegundos, e o preço de não reimplementar o recorte por intervalo aqui.
 */
export function useUpdateScheduleBlock() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation<
    ScheduleBlock,
    Error,
    UpdateScheduleBlockInput,
    { readonly caches: BlockCaches }
  >({
    mutationFn: (input) => updateScheduleBlock(input),

    onMutate: async (input) => {
      if (userId === null) return { caches: [] };

      await queryClient.cancelQueries({ queryKey: scheduleKeys.all(userId) });
      const caches = snapshotBlockCaches(queryClient, userId);

      queryClient.setQueriesData<ScheduleBlockWithTask[]>(
        { queryKey: scheduleKeys.blocks(userId) },
        (entries) =>
          (entries ?? []).map((entry) =>
            entry.block.id === input.id
              ? {
                  ...entry,
                  block: { ...entry.block, startsAt: input.startsAt, endsAt: input.endsAt },
                }
              : entry,
          ),
      );

      return { caches };
    },

    onError: (_error, _input, context) => {
      if (context !== undefined) restoreBlockCaches(queryClient, context.caches);
    },

    onSettled: () =>
      userId === null ? undefined : invalidateScheduleAndTasks(queryClient, userId),
  });
}

/**
 * "Remover da agenda" — apaga o bloco, NUNCA a tarefa.
 *
 * Com atualização otimista porque o bloco some da timeline no toque, e o
 * rollback é trivial: basta devolver os dias que estavam em cache.
 */
export function useDeleteScheduleBlock() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation<void, Error, ScheduleBlock, { readonly caches: BlockCaches }>({
    mutationFn: (block) => deleteScheduleBlock(block.id),

    onMutate: async (block) => {
      if (userId === null) return { caches: [] };

      await queryClient.cancelQueries({ queryKey: scheduleKeys.all(userId) });
      const caches = snapshotBlockCaches(queryClient, userId);

      queryClient.setQueriesData<ScheduleBlockWithTask[]>(
        { queryKey: scheduleKeys.blocks(userId) },
        (entries) => (entries ?? []).filter((entry) => entry.block.id !== block.id),
      );

      return { caches };
    },

    onError: (_error, _block, context) => {
      if (context !== undefined) restoreBlockCaches(queryClient, context.caches);
    },

    // A tarefa pode ter voltado a ser "não agendada": os dois lados reconciliam.
    onSettled: () =>
      userId === null ? undefined : invalidateScheduleAndTasks(queryClient, userId),
  });
}

type CompletionVariables = { readonly task: Task; readonly completed: boolean };

/**
 * Concluir (ou reabrir) a tarefa DIRETAMENTE pela agenda.
 *
 * Reaproveita integralmente a Etapa 1: a chamada é a mesma
 * `setTaskCompletion` usada na Inbox — que envia só o `status`, deixando o
 * instante para o trigger do banco — e a previsão local usa a mesma transição
 * de domínio. Aqui não existe nenhuma regra de conclusão nova.
 *
 * O que muda é apenas QUAL cache é atualizado de forma otimista: o da agenda,
 * onde o card do bloco mostra o estado da tarefa. O BLOCO PERMANECE — concluir
 * não desmarca o planejamento.
 */
export function useToggleTaskCompletionFromAgenda() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation<Task, Error, CompletionVariables, { readonly caches: BlockCaches }>({
    mutationFn: ({ task, completed }) => setTaskCompletion(task.id, completed),

    onMutate: async ({ task, completed }) => {
      if (userId === null) return { caches: [] };

      await queryClient.cancelQueries({ queryKey: scheduleKeys.all(userId) });
      const caches = snapshotBlockCaches(queryClient, userId);

      const patch = completed ? taskCompletionFields(new Date()) : taskReopenFields();

      queryClient.setQueriesData<ScheduleBlockWithTask[]>(
        { queryKey: scheduleKeys.blocks(userId) },
        (entries) =>
          (entries ?? []).map((entry) =>
            entry.task.id === task.id
              ? { ...entry, task: { ...entry.task, ...patch } }
              : entry,
          ),
      );

      return { caches };
    },

    onError: (_error, _variables, context) => {
      if (context !== undefined) restoreBlockCaches(queryClient, context.caches);
    },

    onSettled: () =>
      userId === null ? undefined : invalidateScheduleAndTasks(queryClient, userId),
  });
}

export { invalidateSchedule };
