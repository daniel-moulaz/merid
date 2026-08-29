import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import {
  addDaysToCalendarDate,
  daysBetweenCalendarDates,
  formatCalendarDate,
  formatMinutes,
  isCalendarDate,
} from "@/lib/time";
import { control, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useTimeZone, useToday } from "@/modules/profile/profile-queries";
import { useDayBlocks, useUnscheduledTasks } from "@/modules/schedule/data/schedule-queries";
import {
  blockDurationMinutes,
  type ScheduleBlockWithTask,
} from "@/modules/schedule/domain/schedule-block";
import { BlockActions } from "@/modules/schedule/ui/block-actions";
import { DayTimeline } from "@/modules/schedule/ui/day-timeline";
import {
  UnscheduledTasks,
  unscheduledSummary,
} from "@/modules/schedule/ui/unscheduled-tasks";
import type { Task } from "@/modules/tasks/domain/task";
import { Chevron } from "@/ui/chevron";
import { Screen } from "@/ui/screen";
import { Text } from "@/ui/text";

/**
 * HOJE — a tela principal do Dayflow.
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

  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlockWithTask | null>(null);
  const [isPanelOpen, setPanelOpen] = useState(false);

  const dayBlocks = useDayBlocks(date);
  const unscheduled = useUnscheduledTasks();

  const entries = useMemo(() => dayBlocks.data ?? [], [dayBlocks.data]);

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

  function reschedule(entry: ScheduleBlockWithTask): void {
    setSelectedBlock(null);
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
      onSelectBlock={setSelectedBlock}
      isRefreshing={dayBlocks.isRefetching}
      onRefresh={() => void dayBlocks.refetch()}
    />
  );

  const list = (
    <UnscheduledTasks
      tasks={unscheduled.tasks}
      isPending={unscheduled.isPending}
      isError={unscheduled.isError}
      onSchedule={openSchedule}
    />
  );

  return (
    <Screen
      maxWidth={isWide ? WIDE_MAX_WIDTH : undefined}
      edges={["top"]}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text variant="title">{dayTitle(dayOffset)}</Text>
            <Text variant="label" muted>
              {capitalizeFirst(
                formatCalendarDate(date, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }),
              )}
            </Text>
          </View>

          {/* Os três controles formam um grupo só, com divisores internos: lidos
              como "navegação de dias", e não como três botões avulsos que
              competem com o título. */}
          <View style={[styles.nav, { borderColor: colors.border }]}>
            <NavButton direction="previous" onPress={() => setDayOffset((d) => d - 1)} />

            {dayOffset === 0 ? null : (
              <>
                <View style={[styles.navDivider, { backgroundColor: colors.border }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voltar para hoje"
                  onPress={() => setDayOffset(0)}
                  style={({ pressed }) => [
                    styles.todayButton,
                    { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
                  ]}
                >
                  <Text variant="caption" style={{ color: colors.accent, fontWeight: fontWeight.semibold }}>
                    Hoje
                  </Text>
                </Pressable>
              </>
            )}

            <View style={[styles.navDivider, { backgroundColor: colors.border }]} />
            <NavButton direction="next" onPress={() => setDayOffset((d) => d + 1)} />
          </View>
        </View>

        <Text variant="caption" muted>
          {entries.length === 0
            ? "Nada agendado."
            : `${entries.length} ${entries.length === 1 ? "bloco" : "blocos"} · ${formatMinutes(plannedMinutes)} planejados`}
        </Text>

        {dayBlocks.isError ? (
          <Text variant="caption" tone="danger">
            Não foi possível carregar a agenda. Puxe para atualizar.
          </Text>
        ) : null}
      </View>

      {isWide ? (
        <View style={styles.wide}>
          <View style={[styles.sidebar, { borderRightColor: colors.border }]}>
            <Text variant="label" muted style={styles.sidebarHeading}>
              NÃO AGENDADAS
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

      <BlockActions
        entry={selectedBlock}
        timeZone={timeZone}
        onClose={() => setSelectedBlock(null)}
        onReschedule={reschedule}
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

/**
 * Seta de dia.
 *
 * O chevron é desenhado com bordas em vez de "‹"/"›": os glifos tipográficos
 * têm métricas diferentes entre fontes de sistema e no Android as duas setas
 * saíam com pesos e alinhamentos distintos.
 */
function NavButton({
  direction,
  onPress,
}: {
  readonly direction: "previous" | "next";
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === "previous" ? "Dia anterior" : "Próximo dia"}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
      ]}
    >
      <View
        style={[
          styles.navArrow,
          {
            borderColor: colors.text,
            transform: [{ rotate: direction === "previous" ? "-135deg" : "45deg" }],
            marginLeft: direction === "previous" ? 3 : -3,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, paddingTop: spacing.md, paddingBottom: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerText: { gap: 2, flexShrink: 1 },
  nav: {
    flexDirection: "row",
    alignItems: "stretch",
    height: control.minTouch,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  navDivider: { width: StyleSheet.hairlineWidth },
  navButton: {
    width: control.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  navArrow: {
    width: 9,
    height: 9,
    borderTopWidth: control.strokeWidth,
    borderRightWidth: control.strokeWidth,
  },
  todayButton: {
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },

  wide: { flex: 1, flexDirection: "row", gap: spacing.xl },
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingRight: spacing.lg,
  },
  sidebarHeading: { letterSpacing: 0.5, paddingTop: spacing.sm },
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
