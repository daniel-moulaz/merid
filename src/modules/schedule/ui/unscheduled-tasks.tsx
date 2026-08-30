import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";

import { formatMinutes } from "@/lib/time";
import { spacing } from "@/theme/tokens";
import type { Task } from "@/modules/tasks/domain/task";
import { Text } from "@/ui/text";

import { UnscheduledTaskRow } from "./unscheduled-task-row";

/**
 * A lista de tarefas abertas que ainda não têm horário.
 *
 * É o contraponto da timeline na mesma tela: de um lado o que já tem QUANDO,
 * do outro o que ainda só tem O QUE. Ver a regra exata em
 * `selectUnscheduledTasks`.
 *
 * O componente não conhece o container: no celular ele vive em um painel que
 * abre e fecha; no desktop, na coluna da esquerda. A lista é a mesma.
 */
export function UnscheduledTasks({
  tasks,
  isPending,
  isError,
  hasAnyTask = true,
  onSchedule,
}: {
  readonly tasks: readonly Task[];
  readonly isPending: boolean;
  readonly isError: boolean;
  /**
   * A conta tem ALGUMA tarefa aberta?
   *
   * "Tudo que está aberto já tem horário" é verdade para quem esvaziou a
   * lista e uma frase sem sentido para quem acabou de criar a conta — e é
   * justamente essa pessoa que precisa de uma direção na primeira tela.
   */
  readonly hasAnyTask?: boolean;
  readonly onSchedule: (task: Task) => void;
}) {
  if (isPending) return <ActivityIndicator style={styles.state} />;

  if (isError) {
    return (
      <Text variant="caption" tone="danger" style={styles.state}>
        Não foi possível carregar suas tarefas.
      </Text>
    );
  }

  if (tasks.length === 0) {
    return (
      <Text variant="caption" muted style={styles.state}>
        {hasAnyTask
          ? "Tudo que está aberto já tem horário."
          : "Suas tarefas aparecem aqui quando ainda não têm hora marcada."}
      </Text>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
      {tasks.map((task) => (
        <UnscheduledTaskRow key={task.id} task={task} onSchedule={onSchedule} />
      ))}
    </ScrollView>
  );
}

/** Resumo de uma linha: quantas tarefas e quanto tempo elas somam. */
export function unscheduledSummary(tasks: readonly Task[]): string {
  if (tasks.length === 0) return "nada esperando";

  const minutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);
  const noun = tasks.length === 1 ? "tarefa" : "tarefas";

  return `${tasks.length} ${noun} · ${formatMinutes(minutes)}`;
}

const styles = StyleSheet.create({
  state: { paddingVertical: spacing.lg, textAlign: "center" },
  list: { paddingBottom: spacing.lg },
});
