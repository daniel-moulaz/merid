import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatMinutes, formatTimeRangeInTimeZone, type CalendarDate } from "@/lib/time";
import { elevation, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useUpdateTask } from "@/modules/tasks/data/task-queries";
import { TaskForm } from "@/modules/tasks/ui/task-form";
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
 * "Mudar horário" é o mesmo UPDATE de "reagendar" — não existe entidade nova só
 * porque a ação mudou de nome. Por isso há um botão, não dois.
 *
 * "Agendar de novo" é a operação oposta: um bloco NOVO para a mesma tarefa,
 * sem tocar neste. Ela existe porque uma tarefa já agendada é justamente a
 * mais difícil de reencontrar no produto — ela sai da lista de não agendadas,
 * então repetir "Estudar AEDS" amanhã obrigava a caçá-la na Inbox.
 *
 * ## Hierarquia
 *
 * Antes eram cinco botões de peso quase igual e a folha lia como um cardápio.
 * A ordem agora segue a frequência real: concluir é a ação de todo dia e fica
 * sozinha em destaque; mexer no horário vem em seguida; abrir a tarefa é
 * ocasional; remover é destrutivo, fica por último e atrás de uma linha.
 *
 * ## Editar a tarefa daqui
 *
 * Um bloco criado pela criação rápida nasce só com título. Sem este caminho, o
 * único jeito de acrescentar notas ou corrigir a estimativa era sair da agenda,
 * abrir a Inbox e reencontrar a tarefa lá — que é justamente a tarefa mais
 * difícil de achar, porque já tem horário e por isso sumiu das não agendadas.
 *
 * É o MESMO `TaskForm` da Inbox, e não uma segunda cópia do formulário: editar
 * uma tarefa tem um lugar só no produto, reaproveitado aqui.
 *
 * Um `Modal` do React Native em vez de uma biblioteca de bottom sheet: funciona
 * em Android, iOS e Web, e não exige development build.
 */
export function BlockActions({
  entry,
  timeZone,
  today,
  onClose,
  onReschedule,
  onScheduleAgain,
}: {
  readonly entry: ScheduleBlockWithTask | null;
  readonly timeZone: string;
  /** Hoje no fuso do usuário — alimenta os atalhos de prazo do formulário. */
  readonly today: CalendarDate;
  readonly onClose: () => void;
  readonly onReschedule: (entry: ScheduleBlockWithTask) => void;
  /** Cria outro bloco para a mesma tarefa, preservando este. */
  readonly onScheduleAgain: (entry: ScheduleBlockWithTask) => void;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const completion = useToggleTaskCompletionFromAgenda();
  const remove = useDeleteScheduleBlock();
  const updateTask = useUpdateTask();

  const [mode, setMode] = useState<"actions" | "editing" | "confirmRemove">("actions");

  /**
   * A folha não desmonta entre um bloco e outro: o componente fica montado com
   * `entry = null` no meio. Sem religar o modo ao bloco exibido, abrir um bloco
   * depois de ter editado outro reabriria direto no formulário do anterior.
   */
  const [shownBlockId, setShownBlockId] = useState<string | null>(null);
  const currentBlockId = entry?.block.id ?? null;
  if (currentBlockId !== shownBlockId) {
    setShownBlockId(currentBlockId);
    setMode("actions");
  }

  if (entry === null) return null;

  const { block, task } = entry;
  const isDone = task.status === "DONE";
  const duration = blockDurationMinutes(block);
  const notes = task.description === null ? "" : task.description.trim();
  const hasNotes = notes !== "";

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

      <KeyboardAvoidingView
        style={styles.sheetWrapper}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              // Editar traz um formulário inteiro: a folha cresce, mas nunca
              // até engolir a tela.
              maxHeight: screenHeight * 0.9,
              // Barra de gestos do Android / home indicator do iOS: sem isto o
              // último botão encosta na borda inferior em aparelho sem botões.
              paddingBottom: insets.bottom + spacing.lg,
            },
          ]}
        >
          <View style={styles.handle}>
            <View style={[styles.handleBar, { backgroundColor: colors.borderStrong }]} />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
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

              {/* O contexto que a pessoa escreveu aparece AQUI, e não no bloco
                  da grade: o cartão precisa continuar dizendo título e horário
                  de relance. Aqui já houve a intenção de abrir, então cabe
                  mostrar do que se trata — recortado, porque isto é um
                  lembrete, e não o lugar de ler o texto inteiro. */}
              {mode === "editing" || !hasNotes ? null : (
                <View style={[styles.notes, { borderLeftColor: colors.border }]}>
                  <Text variant="caption" muted numberOfLines={4}>
                    {notes}
                  </Text>
                </View>
              )}
            </View>

            {mode === "editing" ? (
              <TaskForm
                today={today}
                initialValue={task}
                submitLabel="Salvar tarefa"
                onCancel={() => setMode("actions")}
                onSubmit={async (input) => {
                  await updateTask.mutateAsync({ ...input, id: task.id });
                  setMode("actions");
                }}
              />
            ) : mode === "confirmRemove" ? (
              /* Confirmação em dois toques, no lugar do próprio botão.
                 Um diálogo do sistema empilharia mais um contexto sobre um
                 modal que já está aberto; e um toque só apagava o planejamento
                 por engano, sem volta — que é justamente o que o arrasto deixou
                 de ter quando ganhou desfazer. */
              <View style={styles.actions}>
                <Text variant="caption" muted>
                  Isto apaga só o horário. A tarefa continua na sua lista, sem hora
                  marcada.
                </Text>
                <Button
                  label="Remover da agenda"
                  variant="danger"
                  loading={remove.isPending}
                  onPress={() => remove.mutate(block, { onSuccess: onClose })}
                />
                <Button
                  label="Cancelar"
                  variant="ghost"
                  onPress={() => setMode("actions")}
                />
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  label={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
                  loading={completion.isPending}
                  onPress={() =>
                    completion.mutate({ task, completed: !isDone }, { onSuccess: onClose })
                  }
                />

                <Button
                  label="Mudar horário"
                  variant="secondary"
                  onPress={() => onReschedule(entry)}
                />
                <Button
                  label="Agendar de novo"
                  variant="secondary"
                  onPress={() => onScheduleAgain(entry)}
                />
                <Button
                  label={hasNotes ? "Editar tarefa e notas" : "Editar tarefa"}
                  variant="secondary"
                  onPress={() => setMode("editing")}
                />

                <View style={[styles.separator, { backgroundColor: colors.border }]} />

                <Button
                  label="Remover da agenda"
                  variant="ghost"
                  onPress={() => setMode("confirmRemove")}
                />
                <Button label="Fechar" variant="ghost" onPress={onClose} />
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  sheetWrapper: { pointerEvents: "box-none", flex: 1, justifyContent: "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    ...elevation.sheet,
  },
  handle: { alignItems: "center", paddingTop: spacing.sm, minHeight: spacing.lg },
  handleBar: { width: 36, height: 4, borderRadius: radius.pill },
  scrollContent: { gap: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  header: { gap: 2 },
  notes: { paddingLeft: spacing.md, borderLeftWidth: 2, marginTop: spacing.xs },
  actions: { gap: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
});
