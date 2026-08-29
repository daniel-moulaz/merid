import { Pressable, StyleSheet, View } from "react-native";

import { formatMinutes } from "@/lib/time";
import { control, priorityColor, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useSetTaskCompletion } from "@/modules/tasks/data/task-queries";
import { TASK_PRIORITY_LABEL, type Task } from "@/modules/tasks/domain/task";
import { Button } from "@/ui/button";
import { Text } from "@/ui/text";

/**
 * Uma tarefa que ainda não tem horário.
 *
 * A duração aparece sempre — é o que responde "isso cabe no que sobrou do
 * dia?". A ação principal da linha é AGENDAR: é para isso que a lista existe
 * na tela Hoje. Concluir sem agendar continua possível, porque nem tudo
 * precisa de bloco.
 */
export function UnscheduledTaskRow({
  task,
  onSchedule,
}: {
  readonly task: Task;
  readonly onSchedule: (task: Task) => void;
}) {
  const colors = useThemeColors();
  const completion = useSetTaskCompletion();

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false }}
        accessibilityLabel={`Concluir ${task.title}`}
        onPress={() => completion.mutate({ task, completed: true })}
        style={styles.checkboxTarget}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.checkbox,
              {
                borderColor: pressed ? colors.accent : colors.borderStrong,
                backgroundColor: pressed ? colors.surfaceRaised : "transparent",
              },
            ]}
          />
        )}
      </Pressable>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={styles.title}>
            {task.title}
          </Text>
          <View
            accessibilityLabel={`Prioridade ${TASK_PRIORITY_LABEL[task.priority].toLowerCase()}`}
            style={[styles.priorityDot, { backgroundColor: priorityColor(task.priority, colors) }]}
          />
        </View>
        <Text variant="caption" muted>
          {formatMinutes(task.estimatedMinutes)}
        </Text>
      </View>

      <Button
        label="Agendar"
        variant="secondary"
        accessibilityLabel={`Agendar ${task.title}`}
        onPress={() => onSchedule(task)}
        style={styles.action}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Alvo de toque real de 44 dp em volta de um círculo de 22: `hitSlop` sozinho
  // não é lido pelos serviços de acessibilidade do Android.
  checkboxTarget: {
    width: control.minTouch,
    height: control.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  body: { flex: 1, gap: 2, paddingVertical: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flexShrink: 1 },
  priorityDot: { width: 7, height: 7, borderRadius: radius.pill },
  action: { minHeight: control.chipHeight, paddingHorizontal: spacing.md },
});
