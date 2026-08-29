import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatMinutes, formatTimeRangeInTimeZone } from "@/lib/time";
import { radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Button } from "@/ui/button";
import { Text } from "@/ui/text";

import {
  useDeleteScheduleBlock,
  useToggleTaskCompletionFromAgenda,
} from "../data/schedule-queries";
import {
  blockDurationMinutes,
  type ScheduleBlockWithTask,
} from "../domain/schedule-block";

/**
 * Ações de um bloco da agenda.
 *
 * As duas ações mais importantes são as que provam a separação Task/Bloco:
 *
 *  - **Concluir tarefa**: muda a TAREFA; o bloco continua na agenda, porque o
 *    planejamento aconteceu de verdade e apagá-lo perderia essa informação.
 *  - **Remover da agenda**: apaga o BLOCO; a tarefa continua aberta e volta
 *    para a lista de não agendadas.
 *
 * "Reagendar" é o mesmo UPDATE de "editar horário" — não existe entidade nova
 * só porque a ação mudou de nome. Por isso há um botão, não dois.
 *
 * Um `Modal` do React Native em vez de uma biblioteca de bottom sheet: funciona
 * em Android, iOS e Web, e não exige development build.
 */
export function BlockActions({
  entry,
  timeZone,
  onClose,
  onReschedule,
}: {
  readonly entry: ScheduleBlockWithTask | null;
  readonly timeZone: string;
  readonly onClose: () => void;
  readonly onReschedule: (entry: ScheduleBlockWithTask) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const completion = useToggleTaskCompletionFromAgenda();
  const remove = useDeleteScheduleBlock();

  if (entry === null) return null;

  const { block, task } = entry;
  const isDone = task.status === "DONE";
  const duration = blockDurationMinutes(block);

  function confirmRemove(): void {
    if (entry === null) return;
    remove.mutate(entry.block, { onSuccess: onClose });
  }

  return (
    <Modal
      visible
      transparent
      animationType={Platform.OS === "web" ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      {/* Toque fora fecha — é o gesto esperado em uma folha de ações. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar ações do bloco"
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}
        onPress={onClose}
      />

      <View style={styles.sheetWrapper} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              // Barra de gestos do Android / home indicator do iOS: sem isto o
              // último botão encosta na borda inferior em aparelho sem botões.
              paddingBottom: insets.bottom + spacing.lg,
            },
          ]}
        >
          <View style={styles.handle}>
            <View style={[styles.handleBar, { backgroundColor: colors.borderStrong }]} />
          </View>

          <View style={styles.header}>
            <Text variant="heading">{task.title}</Text>
            <Text variant="label" muted>
              {formatTimeRangeInTimeZone(block.startsAt, block.endsAt, timeZone)} ·{" "}
              {formatMinutes(duration)}
            </Text>
            {duration === task.estimatedMinutes ? null : (
              <Text variant="caption" muted>
                Estimativa da tarefa: {formatMinutes(task.estimatedMinutes)}
              </Text>
            )}
          </View>

          <View style={styles.actions}>
            <Button
              label={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
              loading={completion.isPending}
              onPress={() =>
                completion.mutate({ task, completed: !isDone }, { onSuccess: onClose })
              }
            />

            <Button
              label="Reagendar (editar horário)"
              variant="secondary"
              onPress={() => onReschedule(entry)}
            />

            <Button
              label="Remover da agenda"
              variant="secondary"
              loading={remove.isPending}
              onPress={confirmRemove}
            />

            <Text variant="caption" muted style={styles.hint}>
              Remover da agenda apaga só o horário. A tarefa continua na sua lista.
            </Text>

            <Button label="Fechar" variant="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheetWrapper: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  handle: { alignItems: "center", paddingTop: spacing.sm, minHeight: spacing.lg },
  handleBar: { width: 36, height: 4, borderRadius: radius.pill },
  header: { gap: 2 },
  actions: { gap: spacing.sm },
  hint: { paddingHorizontal: spacing.xs, lineHeight: 16 },
});
