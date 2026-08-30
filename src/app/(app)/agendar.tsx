import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import { isCalendarDate, isTimeOfDay, type CalendarDate } from "@/lib/time";
import { spacing } from "@/theme/tokens";
import { useTimeZone } from "@/modules/profile/profile-queries";
import { useScheduleBlock } from "@/modules/schedule/data/schedule-queries";
import { ScheduleForm } from "@/modules/schedule/ui/schedule-form";
import { TaskPicker } from "@/modules/schedule/ui/task-picker";
import { useTask } from "@/modules/tasks/data/task-queries";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { Text } from "@/ui/text";

/**
 * "Agendar" — a ponte entre a tarefa e a agenda.
 *
 * Uma rota só serve os três casos, porque são a mesma operação vista de
 * ângulos diferentes:
 *
 *   /agendar?taskId=…                        cria um bloco para a tarefa
 *   /agendar?taskId=…&blockId=…              reagenda um bloco existente
 *   /agendar?date=…&startTime=…              vem do calendário: falta a tarefa
 *
 * O terceiro caso é o que a grade semanal abre. Quem toca um vazio já decidiu
 * o QUANDO e falta o O QUÊ — o inverso do fluxo da Inbox. Em vez de um segundo
 * fluxo de agendamento, a rota só ganha um passo à frente: escolhida a tarefa,
 * `taskId` entra nos parâmetros e cai no MESMO formulário já validado.
 *
 * Apresentada como folha modal sobre a agenda: agendar é uma decisão rápida,
 * não uma mudança de contexto.
 */
export default function ScheduleRoute() {
  const router = useRouter();
  const timeZone = useTimeZone();
  const { taskId, blockId, date, startTime, from } = useLocalSearchParams<{
    taskId?: string;
    blockId?: string;
    date?: string;
    startTime?: string;
    from?: string;
  }>();

  const task = useTask(taskId);
  const block = useScheduleBlock(blockId);

  const isEditing = blockId !== undefined;
  const isPicking = taskId === undefined;
  const isLoading = !isPicking && (task.isPending || (isEditing && block.isPending));

  /**
   * Depois de salvar, o destino é a agenda — no dia do bloco, e na TELA de
   * onde a pessoa veio.
   *
   * Voltar para a tela anterior deixaria o resultado invisível quando o
   * agendamento foi para outro dia (ou quando veio da Inbox). Ver o bloco
   * aparecer é a confirmação de que deu certo. E quem estava planejando a
   * semana volta para a semana: ser jogado no dia a cada bloco criado
   * quebraria justamente o trabalho em curso.
   */
  function done(scheduledDate: CalendarDate): void {
    const pathname = from === "agenda" ? "/agenda" : "/hoje";
    router.replace({ pathname, params: { date: scheduledDate } });
  }

  /** Cancelar não deve mudar de contexto: volta para de onde veio. */
  function cancel(): void {
    if (router.canGoBack()) router.back();
    else router.replace(from === "agenda" ? "/agenda" : "/hoje");
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

      {isPicking ? (
        /* Sem `taskId`: o passo que falta é a tarefa. `setParams` mantém data,
           horário e origem, então a escolha só preenche a lacuna. */
        <TaskPicker
          onSelect={(picked) => router.setParams({ taskId: picked.id })}
          onCancel={cancel}
        />
      ) : isLoading ? (
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
            initialStartTime={isTimeOfDay(startTime) ? startTime : undefined}
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
