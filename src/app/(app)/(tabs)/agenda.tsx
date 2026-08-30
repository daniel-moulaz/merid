import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { formatMinutes, isCalendarDate, type CalendarDate, type TimeOfDay } from "@/lib/time";
import { control, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useTimeZone, useToday } from "@/modules/profile/profile-queries";
import { useUnscheduledTasks, useWeekBlocks } from "@/modules/schedule/data/schedule-queries";
import {
  blockDurationMinutes,
  type ScheduleBlockWithTask,
} from "@/modules/schedule/domain/schedule-block";
import {
  addWeeks,
  formatWeekRange,
  startOfWeek,
  weeksBetween,
} from "@/modules/schedule/domain/week";
import { BlockActions } from "@/modules/schedule/ui/block-actions";
import { UnscheduledTasks, unscheduledSummary } from "@/modules/schedule/ui/unscheduled-tasks";
import { WeekGrid } from "@/modules/schedule/ui/week-grid";
import type { Task } from "@/modules/tasks/domain/task";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { Text } from "@/ui/text";

/**
 * AGENDA — a semana.
 *
 * Hoje responde "o que eu faço agora?". A semana responde outra pergunta:
 * "para onde isso está indo?" — onde estão os buracos, que dia ficou pesado,
 * o que já tem hora até domingo.
 *
 * As duas telas leem a MESMA tabela pelas mesmas regras; só a janela de tempo
 * muda. Como as chaves de cache compartilham o prefixo
 * `["schedule", user, "blocks"]`, um bloco criado aqui aparece em Hoje sem
 * nenhuma sincronização manual — e vice-versa.
 */

/** A partir daqui cabem a grade e a coluna de não agendadas lado a lado. */
const WIDE_BREAKPOINT = 900;
const SIDEBAR_WIDTH = 300;
const WIDE_MAX_WIDTH = 1400;

export default function WeekScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const today = useToday();
  const timeZone = useTimeZone();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  /**
   * Como em Hoje, a semana visível é um DESLOCAMENTO e não uma data fixa:
   * assim a tela continua certa se a meia-noite virar, ou se o fuso do perfil
   * chegar depois do primeiro render.
   */
  const [weekOffset, setWeekOffset] = useState(0);

  // Agendar a partir da grade volta para cá apontando o dia do bloco — que
  // pode cair em outra semana quando o formulário mudou a data.
  const { date: requestedDate } = useLocalSearchParams<{ date?: string }>();
  const [appliedDate, setAppliedDate] = useState<string | null>(null);
  if (isCalendarDate(requestedDate) && requestedDate !== appliedDate) {
    setAppliedDate(requestedDate);
    setWeekOffset(weeksBetween(today, requestedDate));
  }

  const weekStart = useMemo(() => addWeeks(startOfWeek(today), weekOffset), [today, weekOffset]);

  const [selectedBlock, setSelectedBlock] = useState<ScheduleBlockWithTask | null>(null);

  const weekBlocks = useWeekBlocks(weekStart);
  const unscheduled = useUnscheduledTasks();

  const entries = useMemo(() => weekBlocks.data ?? [], [weekBlocks.data]);

  const plannedMinutes = entries.reduce(
    (total, entry) => total + blockDurationMinutes(entry.block),
    0,
  );

  /**
   * Toque num vazio: o QUANDO já está decidido, falta escolher a tarefa.
   *
   * Sem horário (ativação por teclado, que não tem posição), o parâmetro nem
   * é enviado — o formulário cai no padrão dele em vez de receber um valor
   * inventado aqui.
   */
  function scheduleAt(date: CalendarDate, startTime: TimeOfDay | undefined): void {
    router.push({
      pathname: "/agendar",
      params: startTime === undefined ? { date, from: "agenda" } : { date, startTime, from: "agenda" },
    });
  }

  /** Toque numa não agendada (desktop): mesma rota, com a tarefa já escolhida. */
  function scheduleTask(task: Task): void {
    router.push({
      pathname: "/agendar",
      params: { taskId: task.id, date: weekStart, from: "agenda" },
    });
  }

  function reschedule(entry: ScheduleBlockWithTask): void {
    setSelectedBlock(null);
    router.push({
      pathname: "/agendar",
      params: { taskId: entry.task.id, blockId: entry.block.id, from: "agenda" },
    });
  }

  /** O "+N" de uma coluna cheia abre aquele dia em Hoje, que tem largura. */
  function openDay(date: CalendarDate): void {
    router.push({ pathname: "/hoje", params: { date } });
  }

  return (
    <Screen maxWidth={isWide ? WIDE_MAX_WIDTH : undefined} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text variant="title" numberOfLines={1}>
              {formatWeekRange(weekStart)}
            </Text>
            <Text variant="label" muted>
              {weekLabel(weekOffset)}
            </Text>
          </View>

          {/* Mesmo grupo de navegação de Hoje, na mesma posição: a única coisa
              que muda entre as duas telas é a UNIDADE do passo. */}
          <View style={[styles.nav, { borderColor: colors.border }]}>
            <NavButton direction="previous" onPress={() => setWeekOffset((week) => week - 1)} />

            {weekOffset === 0 ? null : (
              <>
                <View style={[styles.navDivider, { backgroundColor: colors.border }]} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Voltar para a semana atual"
                  onPress={() => setWeekOffset(0)}
                  style={({ pressed }) => [
                    styles.todayButton,
                    { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={{ color: colors.accent, fontWeight: fontWeight.semibold }}
                  >
                    Hoje
                  </Text>
                </Pressable>
              </>
            )}

            <View style={[styles.navDivider, { backgroundColor: colors.border }]} />
            <NavButton direction="next" onPress={() => setWeekOffset((week) => week + 1)} />
          </View>
        </View>

        <Text variant="caption" muted>
          {entries.length === 0
            ? "Nada agendado nesta semana."
            : `${entries.length} ${entries.length === 1 ? "bloco" : "blocos"} · ${formatMinutes(plannedMinutes)} planejados`}
        </Text>

        {weekBlocks.isError ? (
          <View style={styles.errorRow}>
            <Text variant="caption" tone="danger">
              Não foi possível carregar a semana.
            </Text>
            <Button
              label="Tentar de novo"
              variant="secondary"
              onPress={() => void weekBlocks.refetch()}
            />
          </View>
        ) : null}
      </View>

      {weekBlocks.isPending ? (
        <ActivityIndicator style={styles.state} />
      ) : (
        <View style={isWide ? styles.wide : styles.narrow}>
          <View style={styles.gridArea}>
            <WeekGrid
              weekStart={weekStart}
              today={today}
              timeZone={timeZone}
              entries={entries}
              onSelectBlock={setSelectedBlock}
              onSelectSlot={scheduleAt}
              onOpenDay={openDay}
              isRefreshing={weekBlocks.isRefetching}
              onRefresh={() => void weekBlocks.refetch()}
            />

            {/* O vazio não é erro: é convite, e diz qual é o gesto. Fica SOBRE a
                grade, sem capturar toque, para que o convite e o alvo do toque
                sejam a mesma superfície. */}
            {entries.length === 0 && !weekBlocks.isError ? (
              <View pointerEvents="none" style={styles.empty}>
                <Text variant="caption" muted style={styles.emptyText}>
                  Sua semana está livre. Toque em um horário para planejar uma tarefa.
                </Text>
              </View>
            ) : null}
          </View>

          {isWide ? (
            <View style={[styles.sidebar, { borderLeftColor: colors.border }]}>
              <Text variant="label" muted style={styles.sidebarHeading}>
                NÃO AGENDADAS
              </Text>
              <Text variant="caption" muted style={styles.sidebarSummary}>
                {unscheduledSummary(unscheduled.tasks)}
              </Text>
              <UnscheduledTasks
                tasks={unscheduled.tasks}
                isPending={unscheduled.isPending}
                isError={unscheduled.isError}
                onSchedule={scheduleTask}
              />
            </View>
          ) : null}
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

function weekLabel(offset: number): string {
  if (offset === 0) return "Esta semana";
  if (offset === 1) return "Próxima semana";
  if (offset === -1) return "Semana passada";
  return offset > 0 ? `Em ${offset} semanas` : `${-offset} semanas atrás`;
}

/**
 * A mesma seta desenhada de Hoje.
 *
 * Repetida de propósito: extrair um componente compartilhado hoje amarraria as
 * duas telas por um detalhe visual de nove pixels, e a próxima diferença entre
 * elas viraria uma prop de configuração. Se aparecer uma terceira, aí sim vale.
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
      accessibilityLabel={direction === "previous" ? "Semana anterior" : "Próxima semana"}
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
  headerText: { gap: 2, flexShrink: 1, paddingRight: spacing.sm },
  nav: {
    flexDirection: "row",
    alignItems: "stretch",
    height: control.minTouch,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  navDivider: { width: StyleSheet.hairlineWidth },
  navButton: { width: control.minTouch, alignItems: "center", justifyContent: "center" },
  navArrow: {
    width: 9,
    height: 9,
    borderTopWidth: control.strokeWidth,
    borderRightWidth: control.strokeWidth,
  },
  todayButton: { paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center" },

  errorRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  state: { paddingVertical: spacing.xxl },

  wide: { flex: 1, flexDirection: "row", gap: spacing.lg },
  narrow: { flex: 1 },
  gridArea: { flex: 1 },
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.lg,
  },
  sidebarHeading: { letterSpacing: 0.5, paddingTop: spacing.sm },
  sidebarSummary: { paddingBottom: spacing.sm },

  empty: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyText: { textAlign: "center", maxWidth: 260 },
});
