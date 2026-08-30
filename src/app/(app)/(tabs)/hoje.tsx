import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import {
  addDaysToCalendarDate,
  daysBetweenCalendarDates,
  formatCalendarDate,
  formatMinutes,
  isCalendarDate,
  type CalendarDate,
  type TimeOfDay,
} from "@/lib/time";
import { control, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useTimeZone, useToday } from "@/modules/profile/profile-queries";
import { useDayBlocks, useUnscheduledTasks } from "@/modules/schedule/data/schedule-queries";
import {
  blockDurationMinutes,
  type ScheduleBlockWithTask,
} from "@/modules/schedule/domain/schedule-block";
import { BlockActions } from "@/modules/schedule/ui/block-actions";
import { DayTimeline } from "@/modules/schedule/ui/day-timeline";
import { MoveFeedback } from "@/modules/schedule/ui/move-feedback";
import { useMoveBlockAction } from "@/modules/schedule/ui/use-move-block-action";
import {
  UnscheduledTasks,
  unscheduledSummary,
} from "@/modules/schedule/ui/unscheduled-tasks";
import type { Task } from "@/modules/tasks/domain/task";
import { Chevron } from "@/ui/chevron";
import { PeriodNav } from "@/ui/period-nav";
import { Screen } from "@/ui/screen";
import { ScreenHeader } from "@/ui/screen-header";
import { Text } from "@/ui/text";

/**
 * HOJE — a tela principal do Merid.
 *
 * Ela existe para responder duas perguntas de uma vez:
 *
 *   "o que eu planejei para agora?"   → a timeline
 *   "o que ainda não tem hora?"       → as não agendadas
 *
 * No celular a agenda ocupa a tela e as não agendadas ficam em um painel que
 * abre com um toque — a agenda é a protagonista, mas o que falta agendar está
 * sempre a um gesto. No desktop as duas colunas convivem, porque há espaço:
 * mesma árvore de componentes, só o container muda. Nenhum arquivo `.web.tsx`.
 */

/** A partir daqui cabem duas colunas confortavelmente. */
const WIDE_BREAKPOINT = 900;
/** Aberto, o painel não passa de dois quintos da altura da tela. */
const PANEL_MAX_RATIO = 0.4;
const SIDEBAR_WIDTH = 320;
const WIDE_MAX_WIDTH = 1180;

export default function TodayScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const today = useToday();
  const timeZone = useTimeZone();
  const { width, height } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  /**
   * O dia visível é guardado como DESLOCAMENTO em relação a hoje, e não como
   * data fixa: assim a tela continua correta se a meia-noite passar (ou se o
   * fuso do perfil chegar depois do primeiro render) sem nenhum efeito extra.
   */
  const [dayOffset, setDayOffset] = useState(0);

  // Depois de agendar, a tela volta apontando para o dia do bloco recém-criado
  // — inclusive quando ele não é hoje. Sem isto, agendar para amanhã pareceria
  // não ter funcionado.
  const { date: requestedDate } = useLocalSearchParams<{ date?: string }>();
  const [appliedDate, setAppliedDate] = useState<string | null>(null);
  if (isCalendarDate(requestedDate) && requestedDate !== appliedDate) {
    setAppliedDate(requestedDate);
    setDayOffset(daysBetweenCalendarDates(today, requestedDate));
  }

  const date = useMemo(() => addDaysToCalendarDate(today, dayOffset), [today, dayOffset]);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isPanelOpen, setPanelOpen] = useState(false);

  const dayBlocks = useDayBlocks(date);
  const unscheduled = useUnscheduledTasks();

  const entries = useMemo(() => dayBlocks.data ?? [], [dayBlocks.data]);

  /**
   * O bloco aberto na folha de ações é derivado da LISTA, e não copiado para o
   * estado.
   *
   * Guardar o objeto congelava a tarefa no instante do toque: editar título ou
   * notas ali dentro gravava certo, mas a folha continuava mostrando o texto
   * antigo até ser fechada e reaberta. Guardando só o id, a folha lê sempre a
   * versão que está em cache — e, se o bloco for removido, ela se fecha sozinha
   * porque o id deixa de existir na lista.
   */
  const selectedBlock = useMemo(
    () => entries.find((entry) => entry.block.id === selectedBlockId) ?? null,
    [entries, selectedBlockId],
  );

  // Depois de `entries`: mover avalia sobreposição contra o que já está no dia.
  const moveAction = useMoveBlockAction({ timeZone, entries });

  const plannedMinutes = entries.reduce(
    (total, entry) => total + blockDurationMinutes(entry.block),
    0,
  );

  function openSchedule(task: Task): void {
    setPanelOpen(false);
    // O dia que está sendo visto vira o padrão do formulário: quem está olhando
    // amanhã quase sempre quer agendar para amanhã.
    router.push({ pathname: "/agendar", params: { taskId: task.id, date } });
  }

  /**
   * Toque em um horário vazio da timeline.
   *
   * Até aqui, agendar a partir de Hoje exigia abrir o painel "Não agendadas" e
   * achar a tarefa — mesmo quando a pessoa já estava olhando exatamente para o
   * buraco que queria preencher. O horário tocado vira o início, e a tarefa é
   * escolhida no passo seguinte.
   */
  function scheduleAt(day: CalendarDate, startTime: TimeOfDay): void {
    setPanelOpen(false);
    router.push({ pathname: "/agendar", params: { date: day, startTime, from: "hoje" } });
  }

  /** Fim de um arrasto: início e fim vieram da pessoa, não da estimativa. */
  function scheduleRange(day: CalendarDate, startTime: TimeOfDay, endTime: TimeOfDay): void {
    setPanelOpen(false);
    router.push({
      pathname: "/agendar",
      params: { date: day, startTime, endTime, from: "hoje" },
    });
  }

  /**
   * Outro bloco para a MESMA tarefa — sem `blockId`, então nada é movido.
   * O dia visível vira o padrão: repetir quase sempre é "de novo por aqui".
   */
  function scheduleAgain(entry: ScheduleBlockWithTask): void {
    setSelectedBlockId(null);
    router.push({
      pathname: "/agendar",
      params: { taskId: entry.task.id, date, from: "hoje" },
    });
  }

  function reschedule(entry: ScheduleBlockWithTask): void {
    setSelectedBlockId(null);
    router.push({
      pathname: "/agendar",
      params: { taskId: entry.task.id, blockId: entry.block.id },
    });
  }

  const timeline = (
    <DayTimeline
      date={date}
      today={today}
      timeZone={timeZone}
      entries={entries}
      onSelectBlock={(entry) => setSelectedBlockId(entry.block.id)}
      onSelectSlot={scheduleAt}
      onSelectRange={scheduleRange}
      onMoveBlock={moveAction.move}
      isLoaded={!dayBlocks.isPending}
      isRefreshing={dayBlocks.isRefetching}
      onRefresh={() => void dayBlocks.refetch()}
    />
  );

  const list = (
    <UnscheduledTasks
      tasks={unscheduled.tasks}
      isPending={unscheduled.isPending}
      isError={unscheduled.isError}
      hasAnyTask={unscheduled.hasAnyTask}
      onSchedule={openSchedule}
    />
  );

  return (
    <Screen
      maxWidth={isWide ? WIDE_MAX_WIDTH : undefined}
      edges={["top"]}
    >
      <ScreenHeader
        title={dayTitle(dayOffset)}
        subtitle={capitalizeFirst(
          formatCalendarDate(date, { weekday: "long", day: "numeric", month: "long" }),
        )}
        summary={
          entries.length === 0
            ? undefined
            : `${entries.length} ${entries.length === 1 ? "bloco" : "blocos"} · ${formatMinutes(plannedMinutes)} planejados`
        }
        trailing={
          <PeriodNav
            showReset={dayOffset !== 0}
            onPrevious={() => setDayOffset((day) => day - 1)}
            onNext={() => setDayOffset((day) => day + 1)}
            onReset={() => setDayOffset(0)}
            previousLabel="Dia anterior"
            nextLabel="Próximo dia"
            resetLabel="Hoje"
            resetAccessibilityLabel="Voltar para hoje"
          />
        }
      >
        {dayBlocks.isError ? (
          <Text variant="caption" tone="danger" style={styles.error}>
            Não foi possível carregar a agenda. Puxe para atualizar.
          </Text>
        ) : null}
      </ScreenHeader>

      {isWide ? (
        <View style={styles.wide}>
          <View style={[styles.sidebar, { borderRightColor: colors.border }]}>
            <Text variant="overline" muted style={styles.sidebarHeading}>
              Não agendadas
            </Text>
            <Text variant="caption" muted style={styles.sidebarSummary}>
              {unscheduledSummary(unscheduled.tasks)}
            </Text>
            {list}
          </View>

          <View style={styles.timelineArea}>{timeline}</View>
        </View>
      ) : (
        <View style={styles.narrow}>
          <View style={styles.timelineArea}>{timeline}</View>

          <View
            style={[
              styles.panel,
              {
                borderTopColor: colors.border,
                backgroundColor: isPanelOpen ? colors.surface : colors.background,
              },
            ]}
          >
            {/* Fechado, a barra é uma linha só: o dia é o protagonista, e cada
                pixel devolvido à timeline conta em tela pequena. */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isPanelOpen }}
              accessibilityLabel={`Não agendadas, ${unscheduledSummary(unscheduled.tasks)}`}
              accessibilityHint={isPanelOpen ? "Recolhe a lista" : "Mostra a lista"}
              onPress={() => setPanelOpen((open) => !open)}
              style={({ pressed }) => [
                styles.panelHeader,
                { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
              ]}
            >
              <Text variant="label" numberOfLines={1}>
                Não agendadas
              </Text>
              <Text variant="caption" muted numberOfLines={1} style={styles.panelSummary}>
                {unscheduledSummary(unscheduled.tasks)}
              </Text>
              <Chevron direction={isPanelOpen ? "down" : "up"} />
            </Pressable>

            {isPanelOpen ? (
              // Teto proporcional: em telas baixas a lista não come a agenda.
              <View style={[styles.panelBody, { maxHeight: height * PANEL_MAX_RATIO }]}>
                {list}
              </View>
            ) : null}
          </View>
        </View>
      )}

      <MoveFeedback
        label={moveAction.undoable?.label ?? null}
        error={moveAction.error}
        onUndo={moveAction.undo}
        onDismiss={moveAction.dismiss}
      />

      <BlockActions
        entry={selectedBlock}
        timeZone={timeZone}
        today={today}
        onClose={() => setSelectedBlockId(null)}
        onReschedule={reschedule}
        onScheduleAgain={scheduleAgain}
      />
    </Screen>
  );
}

/**
 * "sábado, 29 de agosto" -> "Sábado, 29 de agosto".
 *
 * Feito em JavaScript e não com `textTransform: "capitalize"`, que
 * maiusculiza CADA palavra e produziria "Sábado, 29 De Agosto".
 */
function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "Hoje" e "Amanhã" são o vocabulário real; além disso, o dia da semana. */
function dayTitle(offset: number): string {
  if (offset === 0) return "Hoje";
  if (offset === 1) return "Amanhã";
  if (offset === -1) return "Ontem";
  return offset > 0 ? `Em ${offset} dias` : `${-offset} dias atrás`;
}

const styles = StyleSheet.create({
  error: { paddingTop: spacing.xs },

  wide: { flex: 1, flexDirection: "row", gap: spacing.xl },
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingRight: spacing.lg,
  },
  sidebarHeading: { paddingTop: spacing.sm },
  sidebarSummary: { paddingBottom: spacing.sm },

  narrow: { flex: 1 },
  timelineArea: { flex: 1 },
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -spacing.lg,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: control.minTouch,
    paddingHorizontal: spacing.lg,
  },
  /** Empurra a seta para a direita e some primeiro quando falta espaço. */
  panelSummary: { flex: 1, textAlign: "right" },
  panelBody: { paddingHorizontal: spacing.lg },
});
