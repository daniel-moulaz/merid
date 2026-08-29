import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { useAuth } from "@/modules/auth/auth-context";
import { scheduleKeys } from "@/modules/schedule/data/schedule-keys";

import { taskCompletionFields, taskReopenFields, type Task } from "../domain/task";
import type { CreateTaskInput, UpdateTaskInput } from "../domain/task-schemas";
import {
  createTask,
  deleteTask,
  fetchOpenTasks,
  fetchRecentlyCompletedTasks,
  fetchTask,
  setTaskCompletion,
  updateTask,
} from "./task-repository";

/**
 * Estado de servidor via TanStack Query.
 *
 * As chaves incluem o id do usuário: mesmo que a limpeza de cache no logout
 * falhe, o cache de uma conta nunca é servido para outra.
 */

export const taskKeys = {
  all: (userId: string) => ["tasks", userId] as const,
  open: (userId: string) => ["tasks", userId, "open"] as const,
  completed: (userId: string) => ["tasks", userId, "completed"] as const,
  detail: (userId: string, id: string) => ["tasks", userId, "detail", id] as const,
};

/**
 * Toda escrita em tarefa também invalida a AGENDA.
 *
 * Não é zelo excessivo: excluir uma tarefa apaga seus blocos no banco (`on
 * delete cascade`), e concluir muda o que o card do bloco exibe. Sem isto a
 * timeline mostraria um bloco de tarefa que não existe mais.
 *
 * `schedule-keys.ts` não importa nada, então esta dependência não fecha ciclo.
 */
function invalidateTasks(queryClient: QueryClient, userId: string): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: taskKeys.all(userId) }),
    queryClient.invalidateQueries({ queryKey: scheduleKeys.all(userId) }),
  ]).then(() => undefined);
}

export function useOpenTasks() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: taskKeys.open(userId ?? "anonymous"),
    queryFn: fetchOpenTasks,
    enabled: userId !== null,
  });
}

export function useRecentlyCompletedTasks() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: taskKeys.completed(userId ?? "anonymous"),
    queryFn: fetchRecentlyCompletedTasks,
    enabled: userId !== null,
  });
}

/** Uma tarefa pelo id — a tela de agendamento precisa do título e da estimativa. */
export function useTask(id: string | undefined) {
  const { userId } = useAuth();

  return useQuery({
    // `skipToken` em vez de `enabled` + asserção: o TanStack Query desliga a
    // consulta e o TypeScript estreita `id` sem nenhum cast.
    queryKey: taskKeys.detail(userId ?? "anonymous", id ?? "none"),
    queryFn: userId === null || id === undefined ? skipToken : () => fetchTask(id),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: () => (userId === null ? undefined : invalidateTasks(queryClient, userId)),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: (input: UpdateTaskInput) => updateTask(input),
    onSuccess: () => (userId === null ? undefined : invalidateTasks(queryClient, userId)),
  });
}

type CompletionVariables = { readonly task: Task; readonly completed: boolean };
type CompletionContext = { readonly previousOpen?: Task[]; readonly previousCompleted?: Task[] };

/**
 * Concluir precisa parecer instantâneo — é a interação mais repetida do app.
 *
 * A previsão local do novo estado usa a MESMA regra de domínio que o banco
 * aplica no trigger, então a tela não "pisca" para outro valor quando a
 * resposta chega.
 */
export function useSetTaskCompletion() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation<Task, Error, CompletionVariables, CompletionContext>({
    mutationFn: ({ task, completed }) => setTaskCompletion(task.id, completed),

    onMutate: async ({ task, completed }) => {
      if (userId === null) return {};

      await queryClient.cancelQueries({ queryKey: taskKeys.all(userId) });

      const openKey = taskKeys.open(userId);
      const completedKey = taskKeys.completed(userId);
      const previousOpen = queryClient.getQueryData<Task[]>(openKey);
      const previousCompleted = queryClient.getQueryData<Task[]>(completedKey);

      const moved: Task = {
        ...task,
        ...(completed ? taskCompletionFields(new Date()) : taskReopenFields()),
      };

      if (completed) {
        queryClient.setQueryData<Task[]>(openKey, (tasks) =>
          (tasks ?? []).filter((item) => item.id !== task.id),
        );
        queryClient.setQueryData<Task[]>(completedKey, (tasks) => [moved, ...(tasks ?? [])]);
      } else {
        queryClient.setQueryData<Task[]>(completedKey, (tasks) =>
          (tasks ?? []).filter((item) => item.id !== task.id),
        );
        queryClient.setQueryData<Task[]>(openKey, (tasks) => [moved, ...(tasks ?? [])]);
      }

      return { previousOpen, previousCompleted };
    },

    onError: (_error, _variables, context) => {
      if (userId === null || context === undefined) return;
      if (context.previousOpen !== undefined) {
        queryClient.setQueryData(taskKeys.open(userId), context.previousOpen);
      }
      if (context.previousCompleted !== undefined) {
        queryClient.setQueryData(taskKeys.completed(userId), context.previousCompleted);
      }
    },

    // Sempre reconcilia com o servidor: `completed_at` e a ordenação são dele.
    onSettled: () => (userId === null ? undefined : invalidateTasks(queryClient, userId)),
  });
}

type DeleteContext = { readonly previousOpen?: Task[]; readonly previousCompleted?: Task[] };

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation<void, Error, Task, DeleteContext>({
    mutationFn: (task) => deleteTask(task.id),

    onMutate: async (task) => {
      if (userId === null) return {};

      await queryClient.cancelQueries({ queryKey: taskKeys.all(userId) });

      const openKey = taskKeys.open(userId);
      const completedKey = taskKeys.completed(userId);
      const previousOpen = queryClient.getQueryData<Task[]>(openKey);
      const previousCompleted = queryClient.getQueryData<Task[]>(completedKey);

      const remove = (tasks: Task[] | undefined) => (tasks ?? []).filter((i) => i.id !== task.id);
      queryClient.setQueryData<Task[]>(openKey, remove);
      queryClient.setQueryData<Task[]>(completedKey, remove);

      return { previousOpen, previousCompleted };
    },

    onError: (_error, _task, context) => {
      if (userId === null || context === undefined) return;
      if (context.previousOpen !== undefined) {
        queryClient.setQueryData(taskKeys.open(userId), context.previousOpen);
      }
      if (context.previousCompleted !== undefined) {
        queryClient.setQueryData(taskKeys.completed(userId), context.previousCompleted);
      }
    },

    onSettled: () => (userId === null ? undefined : invalidateTasks(queryClient, userId)),
  });
}
