import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { formatMinutes } from "@/lib/time";
import { spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useToday } from "@/modules/profile/profile-queries";
import { useCreateTask, useOpenTasks, useRecentlyCompletedTasks } from "@/modules/tasks/data/task-queries";
import type { Task } from "@/modules/tasks/domain/task";
import { TaskForm } from "@/modules/tasks/ui/task-form";
import { TaskListItem } from "@/modules/tasks/ui/task-list-item";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { Text } from "@/ui/text";

/**
 * Inbox — onde as tarefas nascem e são mantidas.
 *
 * Aqui aparecem TODAS as tarefas abertas, com ou sem horário: é a lista de
 * gestão. A pergunta "o que ainda não tem hora?" é respondida na tela Hoje,
 * pela lista de não agendadas (ver `selectUnscheduledTasks`) — duas visões da
 * mesma verdade, cada uma no lugar em que é útil.
 */
export default function InboxScreen() {
  const today = useToday();
  const colors = useThemeColors();

  const openTasks = useOpenTasks();
  const completedTasks = useRecentlyCompletedTasks();
  const createTask = useCreateTask();

  const [isAdding, setIsAdding] = useState(false);

  const tasks = openTasks.data ?? [];
  const completed = completedTasks.data ?? [];
  const plannedMinutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);

  const sections: readonly ListRow[] = [
    ...tasks.map((task): ListRow => ({ kind: "task", task })),
    ...(completed.length > 0
      ? [
          { kind: "heading", title: "Concluídas" } as ListRow,
          ...completed.map((task): ListRow => ({ kind: "task", task })),
        ]
      : []),
  ];

  return (
    <Screen>
      <FlatList
        data={sections}
        keyExtractor={(row) => (row.kind === "task" ? row.task.id : `heading-${row.title}`)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={openTasks.isRefetching}
            onRefresh={() => {
              void openTasks.refetch();
              void completedTasks.refetch();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="title">Inbox</Text>
              <Text variant="label" muted>
                {tasks.length === 0
                  ? "Nada esperando por você."
                  : `${tasks.length} ${tasks.length === 1 ? "tarefa" : "tarefas"} · ${formatMinutes(plannedMinutes)} estimados`}
              </Text>
            </View>

            {isAdding ? (
              <View style={[styles.form, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <TaskForm
                  today={today}
                  submitLabel="Adicionar"
                  autoFocus
                  onCancel={() => setIsAdding(false)}
                  onSubmit={async (input) => {
                    await createTask.mutateAsync(input);
                  }}
                />
              </View>
            ) : (
              <Button label="+ Nova tarefa" onPress={() => setIsAdding(true)} />
            )}

            {openTasks.isError ? (
              <Text variant="caption" tone="danger">
                Não foi possível carregar suas tarefas. Puxe para atualizar.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "heading" ? (
            <Text variant="caption" muted style={styles.sectionHeading}>
              {item.title.toUpperCase()}
            </Text>
          ) : (
            <TaskListItem task={item.task} today={today} />
          )
        }
        ListEmptyComponent={
          openTasks.isPending ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <Text muted style={styles.empty}>
              Sua Inbox está vazia. Cadastre a próxima coisa que precisa fazer.
            </Text>
          )
        }
      />
    </Screen>
  );
}

type ListRow =
  | { readonly kind: "task"; readonly task: Task }
  | { readonly kind: "heading"; readonly title: string };

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xxl },
  header: { gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md },
  headerText: { gap: 2 },
  form: { borderWidth: 1, borderRadius: 10, padding: spacing.md },
  sectionHeading: { marginTop: spacing.xl, marginBottom: spacing.xs, letterSpacing: 0.5 },
  empty: { textAlign: "center", paddingVertical: spacing.xxl },
  loading: { paddingVertical: spacing.xxl },
});
