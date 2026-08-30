import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import type { CalendarDate } from "@/lib/time";
import { heatmap as HEATMAP, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useToday } from "@/modules/profile/profile-queries";
import { useDailyActivity } from "@/modules/progress/data/progress-queries";
import { totalsFor } from "@/modules/progress/domain/activity";
import { buildHeatmapWeeks, HEATMAP_HISTORY_WEEKS } from "@/modules/progress/domain/heatmap";
import { bestStreak, currentStreak } from "@/modules/progress/domain/streak";
import { Heatmap, Legend } from "@/modules/progress/ui/heatmap";
import { DayDetail, StreakHeader, WeekSummary } from "@/modules/progress/ui/progress-panels";
import { startOfWeek, weekDays, DAYS_IN_WEEK } from "@/modules/schedule/domain/week";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { ScreenHeader } from "@/ui/screen-header";
import { Text } from "@/ui/text";

/**
 * PROGRESSO — o ritmo.
 *
 * Hoje responde "o que eu faço agora?", a Agenda responde "para onde isso
 * está indo?". Esta tela responde a terceira pergunta, que é sobre a pessoa e
 * não sobre a lista: **"eu estou mantendo o ritmo?"**
 *
 * Por isso a hierarquia é sequência → mapa → semana, e não um painel de
 * indicadores. Um dashboard responderia "quanto"; aqui a primeira coisa que se
 * lê é continuidade, que é o que sustenta o hábito.
 *
 * Nada nesta tela mede planejamento. Criar tarefa e reservar horário não
 * acendem nenhuma célula — só conclusão acende. Ver `activity.ts`.
 */

/** A partir daqui a grade deitada cabe e mostra o ano inteiro. */
const WIDE_BREAKPOINT = 760;
const WIDE_MAX_WIDTH = 1100;

export default function ProgressScreen() {
  const colors = useThemeColors();
  const today = useToday();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  const { activity, isPending, isError, isRefetching, refetch } = useDailyActivity();

  const [selectedDate, setSelectedDate] = useState<CalendarDate | null>(null);
  /** Largura real da área da grade — no desktop a tela é limitada por `maxWidth`. */
  const [gridWidth, setGridWidth] = useState(0);

  /**
   * Quantas semanas desenhar.
   *
   * No empilhado é uma escolha de produto: dezesseis semanas são quatro meses
   * de contexto, o bastante para enxergar um padrão sem virar uma rolagem
   * interminável. No deitado é a largura que decide, limitada pelo que a
   * consulta trouxe.
   */
  const visibleWeeks = isWide ? HEATMAP_HISTORY_WEEKS : STACKED_WEEKS;

  const weeks = useMemo(
    () => buildHeatmapWeeks({ today, weeks: visibleWeeks, activity }),
    [today, visibleWeeks, activity],
  );

  const streak = useMemo(() => currentStreak(activity, today), [activity, today]);
  const best = useMemo(() => bestStreak(activity), [activity]);

  const weekTotals = useMemo(
    () => totalsFor(weekDays(startOfWeek(today)), activity),
    [today, activity],
  );

  const selectedCell = useMemo(() => {
    if (selectedDate === null) return null;
    for (const week of weeks) {
      const found = week.days.find((day) => day.date === selectedDate);
      if (found !== undefined) return found;
    }
    return null;
  }, [weeks, selectedDate]);

  /**
   * Tamanho da célula no empilhado: sete colunas dividem a largura útil.
   *
   * Calculado em vez de fixo porque 320 dp e 430 dp são telefones bem
   * diferentes; com valor fixo, um dos dois fica com sobra ou com corte. O piso
   * garante que a célula nunca vire ruído, mesmo na tela mais estreita.
   */
  const cellSize = useMemo(() => {
    if (gridWidth === 0) return HEATMAP.stacked.cell;

    const available = gridWidth - MONTH_TICK_WIDTH - HEATMAP.stacked.gap * (DAYS_IN_WEEK - 1);
    return Math.max(HEATMAP.stacked.minCell, Math.floor(available / DAYS_IN_WEEK));
  }, [gridWidth]);

  function handleGridLayout(event: LayoutChangeEvent): void {
    setGridWidth(event.nativeEvent.layout.width);
  }

  const hasHistory = activity.size > 0;

  return (
    <Screen maxWidth={isWide ? WIDE_MAX_WIDTH : undefined} edges={["top"]} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        <ScreenHeader title="Seu ritmo" subtitle="O que você concluiu, dia a dia." />

        {isPending ? (
          <ActivityIndicator style={styles.state} />
        ) : isError ? (
          <View style={styles.state}>
            <Text variant="caption" tone="danger">
              Não foi possível carregar seu histórico.
            </Text>
            <Button label="Tentar de novo" variant="secondary" onPress={() => void refetch()} />
          </View>
        ) : (
          <>
            <StreakHeader current={streak} best={best} compact={!isWide} />

            {/* Sem histórico, o mapa continua visível — vazio e discreto, como
                um caderno em branco. Escondê-lo faria a tela parecer quebrada;
                enchê-la de zeros faria parecer cobrança. */}
            {hasHistory ? null : (
              <Text variant="caption" muted>
                Seu histórico começa com a primeira tarefa concluída.
              </Text>
            )}

            <View onLayout={handleGridLayout} style={styles.grid}>
              <Heatmap
                weeks={weeks}
                orientation={isWide ? "wide" : "stacked"}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                cellSize={cellSize}
                currentYear={today.slice(0, 4)}
              />
              {/* No deitado a legenda já vem dentro da grade rolável. */}
              {isWide ? null : <Legend color={colors.textMuted} />}
            </View>

            <DayDetail cell={selectedCell} />

            <WeekSummary totals={weekTotals} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Quatro meses: contexto suficiente para ver padrão, sem rolagem infinita. */
const STACKED_WEEKS = 16;
/** Reservado à direita de cada linha para a marca de mês. Ver `heatmap.tsx`. */
const MONTH_TICK_WIDTH = 34;

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  state: { gap: spacing.lg, paddingVertical: spacing.xxl, alignItems: "center" },
  grid: { gap: spacing.xs },
});
