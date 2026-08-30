import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";

import { formatMinutes, isCalendarDate, type CalendarDate, type TimeOfDay } from "@/lib/time";
import { spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useTimeZone, useToday } from "@/modules/profile/profile-queries";
import {
  useMonthBlocks,
  useUnscheduledTasks,
  useWeekBlocks,
} from "@/modules/schedule/data/schedule-queries";
import {
  blockDurationMinutes,
  type ScheduleBlockWithTask,
} from "@/modules/schedule/domain/schedule-block";
import {
  addMonths,
  formatMonth,
  monthsBetween,
  startOfMonth,
} from "@/modules/schedule/domain/month";
import {
  addWeeks,
  formatWeekRange,
  startOfWeek,
  weeksBetween,
} from "@/modules/schedule/domain/week";
import { BlockActions } from "@/modules/schedule/ui/block-actions";
import { MonthGrid } from "@/modules/schedule/ui/month-grid";
import { MoveFeedback } from "@/modules/schedule/ui/move-feedback";
import { UnscheduledTasks, unscheduledSummary } from "@/modules/schedule/ui/unscheduled-tasks";
import { useMoveBlockAction } from "@/modules/schedule/ui/use-move-block-action";
import { WeekGrid } from "@/modules/schedule/ui/week-grid";
import type { Task } from "@/modules/tasks/domain/task";
import { Button } from "@/ui/button";
import { PeriodNav } from "@/ui/period-nav";
import { Screen } from "@/ui/screen";
import { ScreenHeader } from "@/ui/screen-header";
import { SegmentedField } from "@/ui/segmented-field";
import { Text } from "@/ui/text";

/**
 * AGENDA — a semana e o mês.
 *
 * Hoje responde "o que eu faço agora?". Esta tela responde outras duas, que são
 * a mesma pergunta em zooms diferentes: "para onde a semana está indo?" e "como
 * está o mês?".
 *
 * ## Por que mês e semana moram na mesma aba
 *
 * São a mesma agenda com escalas diferentes, e é assim que todo calendário
 * organiza isso — um seletor de visão, não um destino separado. Uma aba própria
 * para o mês custaria largura na barra (a sexta aba deixaria cada uma com ~53 dp
 * em 320 dp, abaixo do alvo de toque) para separar coisas que a pessoa alterna
 * o tempo todo.
 *
 * As três visões leem a MESMA tabela pelas mesmas regras; só a janela de tempo
 * muda. Como as chaves de cache compartilham o prefixo
 * `["schedule", user, "blocks"]`, um bloco criado aqui aparece em Hoje sem
 * nenhuma sincronização manual — e vice-versa.
 */

/** A partir daqui cabem a grade e a coluna de não agendadas lado a lado. */
const WIDE_BREAKPOINT = 900;
const SIDEBAR_WIDTH = 300;
const WIDE_MAX_WIDTH = 1400;

type AgendaView = "week" | "month";

export default function AgendaScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const today = useToday();
  const timeZone = useTimeZone();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const [view, setView] = useState<AgendaView>("week");

  /**
   * O período visível é um DESLOCAMENTO e não uma data fixa: assim a tela
   * continua certa se a meia-noite virar, ou se o fuso do perfil chegar depois
   * do primeiro render.
   *
   * Semana e mês guardam deslocamentos SEPARADOS de propósito: voltar para a
   * semana depois de folhear três meses deve devolver a semana onde ela estava,
   * não uma semana perdida no futuro.
   */
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  // Agendar a partir da grade volta para cá apontando o dia do bloco — que
  // pode cair em outro período quando o formulário mudou a data.
  const { date: requestedDate } = useLocalSearchParams<{ date?: string }>();
  const [appliedDate, setAppliedDate] = useState<string | null>(null);
  if (isCalendarDate(requestedDate) && requestedDate !== appliedDate) {
    setAppliedDate(requestedDate);
    setWeekOffset(weeksBetween(today, requestedDate));
    setMonthOffset(monthsBetween(startOfMonth(today), startOfMonth(requestedDate)));
  }

  const weekStart = useMemo(() => addWeeks(startOfWeek(today), weekOffset), [today, weekOffset]);
  const monthStart = useMemo(
    () => addMonths(startOfMonth(today), monthOffset),
    [today, monthOffset],
  );

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const weekBlocks = useWeekBlocks(weekStart);
  const monthBlocks = useMonthBlocks(monthStart);
  const unscheduled = useUnscheduledTasks();

  const active = view === "week" ? weekBlocks : monthBlocks;
  const entries = useMemo(() => active.data ?? [], [active.data]);

  /**
   * O bloco aberto na folha de ações é derivado da LISTA, e não copiado para o
   * estado — guardar o objeto congelava a tarefa no instante do toque.
   */
  const selectedBlock = useMemo(
    () => entries.find((entry) => entry.block.id === selectedBlockId) ?? null,
    [entries, selectedBlockId],
  );

  const moveAction = useMoveBlockAction({ timeZone, entries });

  const plannedMinutes = entries.reduce(
    (total, entry) => total + blockDurationMinutes(entry.block),
    0,
  );

  const offset = view === "week" ? weekOffset : monthOffset;
  const setOffset = view === "week" ? setWeekOffset : setMonthOffset;

  function scheduleAt(date: CalendarDate, startTime: TimeOfDay | undefined): void {
    router.push({
      pathname: "/agendar",
      params:
        startTime === undefined
          ? { date, from: "agenda" }
          : { date, startTime, from: "agenda" },
    });
  }

  /** Fim de um arrasto: início E fim vieram da pessoa. */
  function scheduleRange(date: CalendarDate, startTime: TimeOfDay, endTime: TimeOfDay): void {
    router.push({
      pathname: "/agendar",
      params: { date, startTime, endTime, from: "agenda" },
    });
  }

  /** Toque numa não agendada (desktop): mesma rota, com a tarefa já escolhida. */
  function scheduleTask(task: Task): void {
    router.push({
      pathname: "/agendar",
      params: { taskId: task.id, date: view === "week" ? weekStart : monthStart, from: "agenda" },
    });
  }

  /** Outro bloco para a MESMA tarefa. Sem `blockId`, este continua onde está. */
  function scheduleAgain(entry: ScheduleBlockWithTask): void {
    setSelectedBlockId(null);
    router.push({
      pathname: "/agendar",
      params: { taskId: entry.task.id, from: "agenda" },
    });
  }

  function reschedule(entry: ScheduleBlockWithTask): void {
    setSelectedBlockId(null);
    router.push({
      pathname: "/agendar",
      params: { taskId: entry.task.id, blockId: entry.block.id, from: "agenda" },
    });
  }

  /** Um dia cheio (ou uma célula do mês) abre aquele dia em Hoje, que tem escala. */
  function openDay(date: CalendarDate): void {
    router.push({ pathname: "/hoje", params: { date } });
  }

  const blockCount = entries.length;
  const summary =
    blockCount === 0
      ? undefined
      : `${blockCount} ${blockCount === 1 ? "bloco" : "blocos"} · ${formatMinutes(plannedMinutes)} planejados`;

  return (
    <Screen maxWidth={isWide ? WIDE_MAX_WIDTH : undefined} edges={["top"]}>
      <ScreenHeader
        title={view === "week" ? formatWeekRange(weekStart) : formatMonth(monthStart)}
        subtitle={view === "week" ? weekLabel(weekOffset) : monthLabel(monthOffset)}
        summary={summary}
        trailing={
          <PeriodNav
            showReset={offset !== 0}
            onPrevious={() => setOffset((value) => value - 1)}
            onNext={() => setOffset((value) => value + 1)}
            onReset={() => setOffset(0)}
            previousLabel={view === "week" ? "Semana anterior" : "Mês anterior"}
            nextLabel={view === "week" ? "Próxima semana" : "Próximo mês"}
            resetLabel="Hoje"
            resetAccessibilityLabel={
              view === "week" ? "Voltar para a semana atual" : "Voltar para o mês atual"
            }
          />
        }
      >
        <View style={styles.switcher}>
          <SegmentedField
            label="Visão da agenda"
            hideLabel
            value={view}
            onChange={setView}
            options={[
              { value: "week", label: "Semana" },
              { value: "month", label: "Mês" },
            ]}
          />
        </View>

        {active.isError ? (
          <View style={styles.errorRow}>
            <Text variant="caption" tone="danger">
              Não foi possível carregar a agenda.
            </Text>
            <Button
              label="Tentar de novo"
              variant="secondary"
              size="sm"
              onPress={() => void active.refetch()}
            />
          </View>
        ) : null}
      </ScreenHeader>

      {active.isPending ? (
        <ActivityIndicator style={styles.state} />
      ) : (
        <View style={isWide ? styles.wide : styles.narrow}>
          <View style={styles.gridArea}>
            {view === "week" ? (
              <WeekGrid
                weekStart={weekStart}
                today={today}
                timeZone={timeZone}
                entries={entries}
                onSelectBlock={(entry) => setSelectedBlockId(entry.block.id)}
                onSelectSlot={scheduleAt}
                onSelectRange={scheduleRange}
                onMoveBlock={moveAction.move}
                onOpenDay={openDay}
                isRefreshing={weekBlocks.isRefetching}
                onRefresh={() => void weekBlocks.refetch()}
              />
            ) : (
              <MonthGrid
                monthStart={monthStart}
                today={today}
                timeZone={timeZone}
                entries={entries}
                onOpenDay={openDay}
                isRefreshing={monthBlocks.isRefetching}
                onRefresh={() => void monthBlocks.refetch()}
              />
            )}
          </View>

          {isWide ? (
            <View style={[styles.sidebar, { borderLeftColor: colors.border }]}>
              <Text variant="overline" muted style={styles.sidebarHeading}>
                Não agendadas
              </Text>
              <Text variant="caption" muted style={styles.sidebarSummary}>
                {unscheduledSummary(unscheduled.tasks)}
              </Text>
              <UnscheduledTasks
                tasks={unscheduled.tasks}
                isPending={unscheduled.isPending}
                isError={unscheduled.isError}
                hasAnyTask={unscheduled.hasAnyTask}
                onSchedule={scheduleTask}
              />
            </View>
          ) : null}
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

function weekLabel(offset: number): string {
  if (offset === 0) return "Esta semana";
  if (offset === 1) return "Próxima semana";
  if (offset === -1) return "Semana passada";
  return offset > 0 ? `Em ${offset} semanas` : `${-offset} semanas atrás`;
}

function monthLabel(offset: number): string {
  if (offset === 0) return "Este mês";
  if (offset === 1) return "Próximo mês";
  if (offset === -1) return "Mês passado";
  return offset > 0 ? `Em ${offset} meses` : `${-offset} meses atrás`;
}

const styles = StyleSheet.create({
  switcher: { paddingTop: spacing.xs, maxWidth: 260 },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexWrap: "wrap",
    paddingTop: spacing.xs,
  },
  state: { paddingVertical: spacing.xxl },

  wide: { flex: 1, flexDirection: "row", gap: spacing.lg },
  narrow: { flex: 1 },
  gridArea: { flex: 1 },
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.lg,
  },
  sidebarHeading: { paddingTop: spacing.sm },
  sidebarSummary: { paddingBottom: spacing.sm },
});
