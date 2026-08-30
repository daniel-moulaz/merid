import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import {
  addMinutesToTimeOfDay,
  DEFAULT_ESTIMATED_MINUTES,
  isCalendarDate,
  isTimeOfDay,
  type CalendarDate,
} from "@/lib/time";
import { spacing } from "@/theme/tokens";
import { useTimeZone } from "@/modules/profile/profile-queries";
import { useScheduleBlock } from "@/modules/schedule/data/schedule-queries";
import { ScheduleForm } from "@/modules/schedule/ui/schedule-form";
import { QuickCreate } from "@/modules/schedule/ui/quick-create";
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
 *   /agendar?date=…&startTime=…              vem do calendário: falta O QUÊ
 *   /agendar?date=…&startTime=…&endTime=…    veio de um arrasto: intervalo pronto
 *
 * Os dois últimos são o que o calendário abre. Quem toca um vazio já decidiu o
 * QUANDO e falta o O QUÊ — o inverso do fluxo da Inbox.
 *
 * A resposta padrão para "o que acontece às 14:00?" é uma coisa NOVA, então
 * esse caso abre a criação rápida (`QuickCreate`): um campo, e pronto. Usar
 * uma tarefa que já existe continua disponível a um toque, e leva ao mesmo
 * formulário completo de sempre — só deixou de ser a pergunta inicial.
 *
 * Apresentada como folha modal sobre a agenda: agendar é uma decisão rápida,
 * não uma mudança de contexto.
 */
export default function ScheduleRoute() {
  const router = useRouter();
  const timeZone = useTimeZone();
  const { taskId, blockId, date, startTime, endTime, from } = useLocalSearchParams<{
    taskId?: string;
    blockId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    from?: string;
  }>();

  const task = useTask(taskId);
  const block = useScheduleBlock(blockId);

  const isEditing = blockId !== undefined;
  /**
   * Sem tarefa: cria uma nova por padrão, ou escolhe uma existente se a pessoa
   * pedir. O estado é local porque isto é um passo de interface, não um lugar
   * — voltar do seletor não deve exigir uma entrada no histórico.
   */
  const [isPickingExisting, setPickingExisting] = useState(false);
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

  /**
   * O horário que o calendário mandou, se mandou.
   *
   * Um toque simples traz só o início; o fim vem da estimativa padrão, porque
   * ainda não existe tarefa de onde tirá-la. Um arrasto traz os dois, e aí a
   * pessoa já disse a duração.
   */
  const quickSlot =
    isCalendarDate(date) && isTimeOfDay(startTime)
      ? {
          date,
          startTime,
          endTime: isTimeOfDay(endTime)
            ? endTime
            : addMinutesToTimeOfDay(startTime, DEFAULT_ESTIMATED_MINUTES),
        }
      : null;

  const isQuickCreating = isPicking && quickSlot !== null && !isPickingExisting;

  /** Cancelar não deve mudar de contexto: volta para de onde veio. */
  function cancel(): void {
    if (router.canGoBack()) router.back();
    else router.replace(from === "agenda" ? "/agenda" : "/hoje");
  }

  return (
    <Screen edges={["top", "bottom"]}>
      {/* A criação rápida traz o próprio cabeçalho, com o horário concreto no
          lugar de uma explicação genérica — dois títulos empilhados só roubariam
          altura da única coisa que importa ali, que é o campo de texto. */}
      {isQuickCreating ? null : (
        <View style={styles.header}>
          <Text variant="title">{isEditing ? "Reagendar" : "Agendar tarefa"}</Text>
          <Text variant="caption" muted>
            Escolher o horário não muda a tarefa — cria (ou move) um bloco na sua
            agenda.
          </Text>
        </View>
      )}

      {isQuickCreating && quickSlot !== null ? (
        <QuickCreate
          date={quickSlot.date}
          startTime={quickSlot.startTime}
          endTime={quickSlot.endTime}
          timeZone={timeZone}
          onCreated={done}
          onUseExisting={() => setPickingExisting(true)}
          onCancel={cancel}
        />
      ) : isPicking ? (
        /* Sem `taskId`: o passo que falta é a tarefa. `setParams` mantém data,
           horário e origem, então a escolha só preenche a lacuna. */
        <TaskPicker
          onSelect={(picked) => router.setParams({ taskId: picked.id })}
          onCancel={quickSlot === null ? cancel : () => setPickingExisting(false)}
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
            initialEndTime={isTimeOfDay(endTime) ? endTime : undefined}
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
