import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { isAppError } from "@/lib/errors";
import { DEFAULT_ESTIMATED_MINUTES, formatMinutes } from "@/lib/time";
import { control, priorityColor, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useCreateTask, useOpenTasks } from "@/modules/tasks/data/task-queries";
import { DEFAULT_TASK_PRIORITY, type Task } from "@/modules/tasks/domain/task";
import { Text } from "@/ui/text";
import { TextField } from "@/ui/text-field";

import { useScheduledTaskIds } from "../data/schedule-queries";

/**
 * Escolha da tarefa ao agendar a partir do calendário.
 *
 * Quando o usuário toca um horário vazio, ele já decidiu o QUANDO e falta o
 * O QUÊ — o inverso do fluxo da Inbox. Por isso as **não agendadas aparecem
 * primeiro**: são exatamente as que estão esperando um horário.
 *
 * A busca filtra localmente. Não é preguiça: a lista já veio inteira para a
 * tela Hoje e cabe em memória com folga no tamanho de uma agenda pessoal;
 * mandar cada tecla ao servidor só adicionaria latência. Se um dia a lista
 * crescer, o filtro sobe para o PostgREST sem mexer em mais nada.
 */
export function TaskPicker({
  onSelect,
  onCancel,
}: {
  readonly onSelect: (task: Task) => void;
  readonly onCancel: () => void;
}) {
  const colors = useThemeColors();
  const openTasks = useOpenTasks();
  const scheduled = useScheduledTaskIds();
  const createTask = useCreateTask();

  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const query = normalize(search.trim());

  /** Não agendadas primeiro; dentro de cada grupo, a ordem do repositório. */
  const tasks = useMemo(() => {
    const all = openTasks.data ?? [];
    const matching =
      query === "" ? all : all.filter((task) => normalize(task.title).includes(query));

    return [...matching].sort((a, b) => {
      const aScheduled = scheduled.scheduledTaskIds.has(a.id) ? 1 : 0;
      const bScheduled = scheduled.scheduledTaskIds.has(b.id) ? 1 : 0;
      return aScheduled - bScheduled;
    });
  }, [openTasks.data, query, scheduled.scheduledTaskIds]);

  const typedTitle = search.trim();
  const hasExactMatch = tasks.some((task) => normalize(task.title) === query);
  const canCreate = typedTitle.length > 0 && !hasExactMatch;

  async function createAndSelect(): Promise<void> {
    setError(null);
    try {
      const task = await createTask.mutateAsync({
        title: typedTitle,
        description: null,
        estimatedMinutes: DEFAULT_ESTIMATED_MINUTES,
        priority: DEFAULT_TASK_PRIORITY,
        dueDate: null,
      });
      onSelect(task);
    } catch (caught) {
      setError(isAppError(caught) ? caught.message : "Não foi possível criar a tarefa.");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="heading">Qual tarefa?</Text>
        <Text variant="caption" muted>
          As que ainda não têm horário aparecem primeiro.
        </Text>
      </View>

      <TextField
        label="Buscar tarefa"
        hideLabel
        placeholder="Buscar ou nomear uma nova tarefa"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        returnKeyType="search"
      />

      {openTasks.isPending ? (
        <ActivityIndicator style={styles.state} />
      ) : openTasks.isError ? (
        <Text variant="caption" tone="danger" style={styles.state}>
          Não foi possível carregar suas tarefas.
        </Text>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {canCreate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Criar tarefa ${typedTitle} de ${formatMinutes(DEFAULT_ESTIMATED_MINUTES)} e agendar`}
              onPress={() => void createAndSelect()}
              disabled={createTask.isPending}
              style={({ pressed }) => [
                styles.row,
                styles.createRow,
                {
                  borderColor: colors.brandBorder,
                  backgroundColor: pressed ? colors.surfaceRaised : colors.brandSoft,
                },
              ]}
            >
              <View style={styles.rowBody}>
                <Text variant="label" numberOfLines={1} style={{ color: colors.brandText }}>
                  Criar “{typedTitle}”
                </Text>
                {/* A duração aparece porque ela é decisão de produto, não um
                    detalhe: nenhuma tarefa nasce sem estimativa. */}
                <Text variant="caption" muted>
                  Nova tarefa de {formatMinutes(DEFAULT_ESTIMATED_MINUTES)} — dá para ajustar
                  no passo seguinte.
                </Text>
              </View>
              {createTask.isPending ? <ActivityIndicator size="small" /> : null}
            </Pressable>
          ) : null}

          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isScheduled={scheduled.scheduledTaskIds.has(task.id)}
              onPress={() => onSelect(task)}
            />
          ))}

          {tasks.length === 0 && !canCreate ? (
            <Text variant="caption" muted style={styles.state}>
              Nenhuma tarefa aberta. Escreva um título acima para criar uma.
            </Text>
          ) : null}
        </ScrollView>
      )}

      {error === null ? null : (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancelar agendamento"
        onPress={onCancel}
        style={styles.cancel}
      >
        <Text variant="label" muted>
          Cancelar
        </Text>
      </Pressable>
    </View>
  );
}

function TaskRow({
  task,
  isScheduled,
  onPress,
}: {
  readonly task: Task;
  readonly isScheduled: boolean;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${task.title}, ${formatMinutes(task.estimatedMinutes)}${
        isScheduled ? ", já tem horário" : ""
      }`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceRaised : colors.surface,
        },
      ]}
    >
      <View
        style={[styles.priorityDot, { backgroundColor: priorityColor(task.priority, colors) }]}
      />
      <View style={styles.rowBody}>
        <Text numberOfLines={1}>{task.title}</Text>
        <Text variant="caption" muted numberOfLines={1}>
          {formatMinutes(task.estimatedMinutes)}
          {isScheduled ? " · já agendada" : ""}
        </Text>
      </View>
    </Pressable>
  );
}

/** Minúsculas sem acento, com recuo seguro se o runtime não tiver `normalize`. */
function normalize(value: string): string {
  const lower = value.toLowerCase();
  try {
    return lower.normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {
    return lower;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: spacing.md },
  header: { gap: 2 },
  list: { gap: spacing.xs, paddingBottom: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: control.minTouch + spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  createRow: { marginBottom: spacing.xs },
  rowBody: { flex: 1, gap: 1 },
  priorityDot: { width: 8, height: 8, borderRadius: radius.pill },
  state: { paddingVertical: spacing.xl, textAlign: "center" },
  cancel: {
    minHeight: control.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
});
