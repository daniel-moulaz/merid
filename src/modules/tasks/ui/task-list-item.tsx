import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";

import { formatCalendarDate, formatMinutes, type CalendarDate } from "@/lib/time";
import { priorityColor, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Button } from "@/ui/button";
import { Text } from "@/ui/text";

import { isDueToday, isOverdue, TASK_PRIORITY_LABEL, type Task } from "../domain/task";
import { useDeleteTask, useSetTaskCompletion, useUpdateTask } from "../data/task-queries";
import { TaskForm } from "./task-form";

/**
 * Uma linha da Inbox.
 *
 * A duração aparece sempre: é a informação que responde se a tarefa cabe no
 * dia. O prazo aparece como DIA, nunca como horário.
 *
 * AGENDAR é a ação em destaque: é o caminho de uma tarefa ("preciso fazer")
 * para um bloco ("vou fazer às 14h"). Agendar não altera a tarefa — cria um
 * ScheduleBlock separado.
 */
export function TaskListItem({
  task,
  today,
}: {
  readonly task: Task;
  readonly today: CalendarDate;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  const [isEditing, setIsEditing] = useState(false);

  const completion = useSetTaskCompletion();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const isDone = task.status === "DONE";

  function confirmDelete() {
    const run = () => remove.mutate(task);

    // `Alert` não existe na web do React Native.
    if (Platform.OS === "web") {
      if (window.confirm(`Excluir "${task.title}"?`)) run();
      return;
    }

    Alert.alert("Excluir tarefa", `Excluir "${task.title}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: run },
    ]);
  }

  if (isEditing) {
    return (
      <View style={[styles.editing, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <TaskForm
          today={today}
          initialValue={task}
          submitLabel="Salvar"
          autoFocus
          onCancel={() => setIsEditing(false)}
          onSubmit={async (input) => {
            await update.mutateAsync({ ...input, id: task.id });
            setIsEditing(false);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={isDone ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
        onPress={() => completion.mutate({ task, completed: !isDone })}
        hitSlop={8}
        style={[
          styles.checkbox,
          {
            borderColor: isDone ? colors.accent : colors.borderStrong,
            backgroundColor: isDone ? colors.accent : "transparent",
          },
        ]}
      >
        {isDone ? <Text style={{ color: colors.textInverted, fontSize: 12 }}>✓</Text> : null}
      </Pressable>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.title, isDone && { textDecorationLine: "line-through" }]}
            muted={isDone}
          >
            {task.title}
          </Text>
          <View
            accessibilityLabel={`Prioridade ${TASK_PRIORITY_LABEL[task.priority].toLowerCase()}`}
            style={[styles.priorityDot, { backgroundColor: priorityColor(task.priority, colors) }]}
          />
        </View>

        <View style={styles.meta}>
          <Text variant="caption" muted>
            {formatMinutes(task.estimatedMinutes)}
          </Text>
          <DueDateLabel task={task} today={today} />
        </View>
      </View>

      <View style={styles.actions}>
        {isDone ? null : (
          <Button
            label="Agendar"
            variant="secondary"
            accessibilityLabel={`Agendar ${task.title}`}
            onPress={() =>
              router.push({ pathname: "/agendar", params: { taskId: task.id } })
            }
            style={styles.scheduleButton}
          />
        )}
        <Button
          label="Editar"
          variant="ghost"
          onPress={() => setIsEditing(true)}
          style={styles.actionButton}
        />
        <Button
          label="Excluir"
          variant="ghost"
          onPress={confirmDelete}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

/** Prazo ≠ horário: mostramos o DIA, destacando quando já passou. */
function DueDateLabel({ task, today }: { readonly task: Task; readonly today: CalendarDate }) {
  if (task.dueDate === null) return null;

  if (isOverdue(task, today)) {
    return (
      <Text variant="caption" tone="danger">
        atrasada · {formatCalendarDate(task.dueDate)}
      </Text>
    );
  }

  return (
    <Text variant="caption" muted={!isDueToday(task, today)}>
      {isDueToday(task, today) ? "hoje" : formatCalendarDate(task.dueDate)}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  body: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flexShrink: 1 },
  priorityDot: { width: 7, height: 7, borderRadius: radius.pill },
  meta: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.xs },
  actionButton: { minHeight: 32, paddingHorizontal: spacing.sm, borderWidth: 0 },
  scheduleButton: { minHeight: 34, paddingHorizontal: spacing.md },
  editing: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
});
