import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { formatMinutes } from "@/lib/time";
import { radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useToday } from "@/modules/profile/profile-queries";
import { useScheduledTaskIds } from "@/modules/schedule/data/schedule-queries";
import {
  useCreateTask,
  useOpenTasks,
  useRecentlyCompletedTasks,
} from "@/modules/tasks/data/task-queries";
import type { Task } from "@/modules/tasks/domain/task";
import { groupTasksByDue, type TaskGroupKey } from "@/modules/tasks/domain/task-grouping";
import { TaskForm } from "@/modules/tasks/ui/task-form";
import { TaskListItem } from "@/modules/tasks/ui/task-list-item";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { ScreenHeader } from "@/ui/screen-header";
import { Text } from "@/ui/text";

/**
 * Inbox — onde as tarefas nascem e são mantidas.
 *
 * Aqui aparecem TODAS as tarefas abertas, com ou sem horário: é a lista de
 * gestão. A pergunta "o que ainda não tem hora?" é respondida na tela Hoje —
 * duas visões da mesma verdade, cada uma no lugar em que é útil.
 *
 * ## Por que a lista ganhou seções
 *
 * A lista era contínua e ordenada por prioridade. Isso responde "o que é
 * importante?", mas não "o que está pegando fogo e o que pode esperar?" — e uma
 * tarefa urgente sem prazo aparecia acima de uma tarefa média que venceu ontem.
 * Vencida é uma condição mais dura que prioridade alta, porque já custou
 * alguma coisa.
 *
 * Agora o prazo é o eixo e a prioridade ordena DENTRO de cada seção. A regra do
 * agrupamento mora no domínio (`groupTasksByDue`) e é testada lá.
 *
 * ## Por que não existe uma aba "Em breve"
 *
 * Porque ela seria esta tela com um filtro. As seções "Amanhã", "Próximos dias"
 * e "Mais adiante" já são o "em breve" das TAREFAS, e o "em breve" dos BLOCOS
 * já é a Agenda. Uma sexta aba dividiria a mesma informação em dois lugares e
 * deixaria cada aba da barra com ~53 dp em telas de 320 dp — abaixo do alvo
 * mínimo de toque.
 */
export default function InboxScreen() {
  const today = useToday();
  const colors = useThemeColors();

  const openTasks = useOpenTasks();
  const completedTasks = useRecentlyCompletedTasks();
  const createTask = useCreateTask();
  // Mesma consulta que Hoje e Agenda já fazem: a chave é compartilhada, então
  // marcar o que tem horário aqui não custa uma requisição a mais.
  const { scheduledTaskIds } = useScheduledTaskIds();

  const [isAdding, setIsAdding] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const tasks = useMemo(() => openTasks.data ?? [], [openTasks.data]);
  const completed = useMemo(() => completedTasks.data ?? [], [completedTasks.data]);

  const plannedMinutes = tasks.reduce((total, task) => total + task.estimatedMinutes, 0);

  const rows = useMemo<ListRow[]>(() => {
    const groups = groupTasksByDue(tasks, today);

    const open = groups.flatMap((group): ListRow[] => [
      { kind: "heading", id: `group-${group.key}`, label: group.label, count: group.tasks.length, tone: group.key },
      ...group.tasks.map((task): ListRow => ({ kind: "task", id: task.id, task })),
    ]);

    if (completed.length === 0) return open;

    return [
      ...open,
      {
        kind: "completedToggle",
        id: "completed-toggle",
        count: completed.length,
      },
      ...(showCompleted
        ? completed.map((task): ListRow => ({ kind: "task", id: `done-${task.id}`, task }))
        : []),
    ];
  }, [tasks, today, completed, showCompleted]);

  return (
    <Screen padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
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
            <ScreenHeader
              title="Inbox"
              summary={
                tasks.length === 0
                  ? undefined
                  : `${tasks.length} ${tasks.length === 1 ? "tarefa" : "tarefas"} · ${formatMinutes(plannedMinutes)} estimados`
              }
            />

            {isAdding ? (
              <View
                style={[
                  styles.form,
                  { borderColor: colors.borderStrong, backgroundColor: colors.surface },
                ]}
              >
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
              <Button label="+  Nova tarefa" onPress={() => setIsAdding(true)} />
            )}

            {openTasks.isError ? (
              <Text variant="caption" tone="danger">
                Não foi possível carregar suas tarefas. Puxe para atualizar.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "heading") {
            return (
              <View style={styles.heading}>
                <Text
                  variant="overline"
                  muted={item.tone !== "OVERDUE"}
                  tone={item.tone === "OVERDUE" ? "danger" : "default"}
                >
                  {item.label}
                </Text>
                <Text variant="caption" muted>
                  {item.count}
                </Text>
              </View>
            );
          }

          if (item.kind === "completedToggle") {
            return (
              <View style={styles.completedToggle}>
                <Button
                  label={
                    showCompleted
                      ? "Ocultar concluídas"
                      : `Concluídas recentemente (${item.count})`
                  }
                  variant="ghost"
                  size="md"
                  onPress={() => setShowCompleted((value) => !value)}
                />
              </View>
            );
          }

          return (
            <TaskListItem
              task={item.task}
              today={today}
              isScheduled={scheduledTaskIds.has(item.task.id)}
            />
          );
        }}
        ListEmptyComponent={
          openTasks.isPending ? (
            <ActivityIndicator style={styles.loading} />
          ) : (
            <View style={styles.empty}>
              <Text variant="subheading">Tudo limpo por aqui</Text>
              <Text variant="caption" muted style={styles.emptyLine}>
                O que você anotar aparece nesta lista e pode ganhar horário na agenda.
              </Text>
            </View>
          )
        }
      />
    </Screen>
  );
}

type ListRow =
  | { readonly kind: "task"; readonly id: string; readonly task: Task }
  | {
      readonly kind: "heading";
      readonly id: string;
      readonly label: string;
      readonly count: number;
      readonly tone: TaskGroupKey;
    }
  | { readonly kind: "completedToggle"; readonly id: string; readonly count: number };

const styles = StyleSheet.create({
  // O recuo mora na lista, e não no `Screen`: assim a rolagem vai de borda a
  // borda e o separador de cada linha atravessa a tela inteira, como em
  // qualquer lista nativa.
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  form: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },

  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },

  completedToggle: { paddingTop: spacing.lg, alignItems: "flex-start" },

  empty: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xxl },
  emptyLine: { textAlign: "center", maxWidth: 320 },
  loading: { paddingVertical: spacing.xxl },
});
