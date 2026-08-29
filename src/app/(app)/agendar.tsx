import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import { isCalendarDate, type CalendarDate } from "@/lib/time";
import { spacing } from "@/theme/tokens";
import { useTimeZone } from "@/modules/profile/profile-queries";
import { useScheduleBlock } from "@/modules/schedule/data/schedule-queries";
import { ScheduleForm } from "@/modules/schedule/ui/schedule-form";
import { useTask } from "@/modules/tasks/data/task-queries";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { Text } from "@/ui/text";

/**
 * "Agendar" — a ponte entre a tarefa e a agenda.
 *
 * Uma rota só serve os dois casos, porque são a mesma operação vista de dois
 * lados:
 *
 *   /agendar?taskId=…              cria um bloco para a tarefa
 *   /agendar?taskId=…&blockId=…    reagenda um bloco existente
 *
 * Apresentada como folha modal sobre a agenda: agendar é uma decisão rápida,
 * não uma mudança de contexto.
 */
export default function ScheduleRoute() {
  const router = useRouter();
  const timeZone = useTimeZone();
  const { taskId, blockId, date } = useLocalSearchParams<{
    taskId?: string;
    blockId?: string;
    date?: string;
  }>();

  const task = useTask(taskId);
  const block = useScheduleBlock(blockId);

  const isEditing = blockId !== undefined;
  const isLoading = task.isPending || (isEditing && block.isPending);

  /**
   * Depois de salvar, o destino é a AGENDA — no dia do bloco.
   *
   * Voltar para a tela anterior deixaria o resultado invisível quando o
   * agendamento foi para outro dia (ou quando veio da Inbox). Ver o bloco
   * aparecer é a confirmação de que deu certo.
   */
  function done(scheduledDate: CalendarDate): void {
    router.replace({ pathname: "/hoje", params: { date: scheduledDate } });
  }

  /** Cancelar não deve mudar de contexto: volta para de onde veio. */
  function cancel(): void {
    if (router.canGoBack()) router.back();
    else router.replace("/hoje");
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text variant="title">{isEditing ? "Reagendar" : "Agendar tarefa"}</Text>
        <Text variant="caption" muted>
          Escolher o horário não muda a tarefa — cria (ou move) um bloco na sua
          agenda.
        </Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.state} />
      ) : task.data === undefined ? (
        <View style={styles.state}>
          <Text tone="danger">Não foi possível carregar a tarefa.</Text>
          <Button label="Voltar" variant="secondary" onPress={cancel} />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <ScheduleForm
            task={task.data}
            timeZone={timeZone}
            initialBlock={isEditing ? block.data : undefined}
            initialDate={isCalendarDate(date) ? date : undefined}
            onDone={done}
            onCancel={cancel}
          />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  state: { gap: spacing.lg, paddingVertical: spacing.xxl, alignItems: "center" },
  content: { paddingBottom: spacing.xxl },
});
