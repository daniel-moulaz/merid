import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";

import { formatCalendarDateBR, formatMinutes, type CalendarDate } from "@/lib/time";
import { control, priorityColor, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Button } from "@/ui/button";
import { Text } from "@/ui/text";

import { isDueToday, isOverdue, TASK_PRIORITY_LABEL, type Task } from "../domain/task";
import { useDeleteTask, useSetTaskCompletion, useUpdateTask } from "../data/task-queries";
import { TaskForm } from "./task-form";

/**
 * Uma linha da Inbox.
 *
 * ## O que mudou, e por quê
 *
 * A linha tinha TRÊS botões visíveis — Agendar, Editar, Excluir — repetidos em
 * cada tarefa. Numa lista de quinze itens são quarenta e cinco controles
 * competindo com quinze títulos, e o mais destrutivo deles ficava a um toque de
 * distância do mais comum.
 *
 * Agora vale o padrão de qualquer lista boa: **a própria linha é o alvo**.
 * Tocá-la abre a edição; excluir mora lá dentro, junto do resto da tarefa. Fica
 * visível só a ação que é específica deste produto — dar horário — porque é
 * ela que leva a tarefa da lista para a agenda, que é a proposta do Merid.
 *
 * A duração aparece sempre: é a informação que responde se a tarefa cabe no
 * dia. O prazo aparece como DIA, nunca como horário.
 */
export function TaskListItem({
  task,
  today,
  isScheduled = false,
}: {
  readonly task: Task;
  readonly today: CalendarDate;
  /**
   * A tarefa já tem bloco de hoje em diante.
   *
   * A Inbox lista TUDO o que está aberto, com ou sem horário — e sem esta marca
   * as duas metades ficavam idênticas: a pessoa reagendava o que já estava
   * agendado, ou procurava na agenda algo que nunca tinha saído da lista.
   */
  readonly isScheduled?: boolean;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  const [isEditing, setIsEditing] = useState(false);

  const completion = useSetTaskCompletion();
  const update = useUpdateTask();
  const remove = useDeleteTask();

  const isDone = task.status === "DONE";
  const hasNotes = task.description !== null && task.description.trim() !== "";
  // Só o que é excepcional ganha cor. Se toda tarefa tivesse um ponto, o ponto
  // deixaria de significar alguma coisa.
  const isFlagged = task.priority === "HIGH" || task.priority === "URGENT";

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
      <View
        style={[
          styles.editing,
          { borderColor: colors.borderStrong, backgroundColor: colors.surface },
        ]}
      >
        <TaskForm
          today={today}
          initialValue={task}
          submitLabel="Salvar"
          autoFocus
          onCancel={() => setIsEditing(false)}
          onDelete={confirmDelete}
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
        style={styles.checkboxTarget}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.checkbox,
              {
                borderColor: isDone
                  ? colors.accent
                  : pressed
                    ? colors.accent
                    : colors.borderStrong,
                backgroundColor: isDone ? colors.accent : "transparent",
              },
            ]}
          >
            {isDone ? <Check color={colors.textInverted} /> : null}
          </View>
        )}
      </Pressable>

      {/* A linha inteira abre a edição — o alvo é o texto, não um botão. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Editar ${task.title}`}
        onPress={() => setIsEditing(true)}
        style={styles.body}
      >
        <View style={styles.titleRow}>
          {isFlagged ? (
            <View
              accessibilityLabel={`Prioridade ${TASK_PRIORITY_LABEL[task.priority].toLowerCase()}`}
              style={[
                styles.flag,
                { backgroundColor: priorityColor(task.priority, colors) },
              ]}
            />
          ) : null}

          <Text
            numberOfLines={2}
            style={[styles.title, isDone && styles.done]}
            muted={isDone}
          >
            {task.title}
          </Text>
        </View>

        <View style={styles.meta}>
          <Text variant="caption" muted>
            {formatMinutes(task.estimatedMinutes)}
          </Text>

          <DueDateLabel task={task} today={today} />

          {hasNotes ? (
            <Text variant="caption" muted accessibilityLabel="Tem notas">
              notas
            </Text>
          ) : null}

          {isScheduled && !isDone ? (
            <Text variant="caption" tone="accent">
              agendada
            </Text>
          ) : null}
        </View>
      </Pressable>

      {isDone ? null : (
        <Button
          // Já tendo horário, agendar de novo é adicionar outra sessão — é
          // legítimo, mas deixa de ser a ação em destaque da linha.
          label={isScheduled ? "+ horário" : "Agendar"}
          variant={isScheduled ? "ghost" : "secondary"}
          size="sm"
          accessibilityLabel={
            isScheduled
              ? `Agendar outro horário para ${task.title}`
              : `Agendar ${task.title}`
          }
          onPress={() => router.push({ pathname: "/agendar", params: { taskId: task.id } })}
        />
      )}
    </View>
  );
}

/** O "✓" desenhado: o glifo tipográfico sai de tamanhos diferentes por fonte. */
function Check({ color }: { readonly color: string }) {
  return <View style={[styles.check, { borderColor: color }]} />;
}

/** Prazo ≠ horário: mostramos o DIA, destacando quando já passou. */
function DueDateLabel({ task, today }: { readonly task: Task; readonly today: CalendarDate }) {
  if (task.dueDate === null) return null;

  if (isOverdue(task, today)) {
    return (
      <Text variant="caption" tone="danger">
        atrasada · {formatCalendarDateBR(task.dueDate)}
      </Text>
    );
  }

  return (
    <Text variant="caption" muted={!isDueToday(task, today)}>
      {isDueToday(task, today) ? "hoje" : formatCalendarDateBR(task.dueDate)}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // Alvo de toque real de 44 dp em volta de um círculo de 22: `hitSlop` sozinho
  // não é lido pelos serviços de acessibilidade do Android.
  checkboxTarget: {
    width: control.minTouch,
    height: control.minTouch,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 9,
    height: 5,
    borderLeftWidth: 1.75,
    borderBottomWidth: 1.75,
    transform: [{ rotate: "-45deg" }],
    marginTop: -2,
  },

  body: { flex: 1, gap: spacing.xxs, paddingVertical: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flexShrink: 1 },
  done: { textDecorationLine: "line-through" },

  /** Barra vertical, e não ponto: lê como marcador de margem, não como enfeite. */
  flag: { width: 3, height: 14, borderRadius: radius.xs },

  meta: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },

  editing: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
});
