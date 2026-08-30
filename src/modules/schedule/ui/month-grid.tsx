import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";

import {
  formatMinutes,
  toCalendarDateInTimeZone,
  type CalendarDate,
} from "@/lib/time";
import { fontSize, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

import {
  blockDurationMinutes,
  type ScheduleBlockWithTask,
} from "../domain/schedule-block";
import { monthWeeks, WEEKDAY_LABELS, type MonthCell } from "../domain/month";
import { DAYS_IN_WEEK } from "../domain/week";

/**
 * A grade do mês.
 *
 * ## O que ela mostra, e o que deliberadamente não mostra
 *
 * Um dia de mês tem cerca de 90 px de altura. Não cabe régua de horas nem
 * posicionamento por minuto, e forçar isso produziria faixas de dois pixels
 * ilegíveis. O que cabe — e o que se procura num mês — é DENSIDADE: onde há
 * compromisso, que dia ficou pesado, onde está o buraco.
 *
 * Então cada célula mostra os primeiros títulos e resume o resto em "+N", como
 * qualquer calendário de mês faz. A pergunta "o que acontece às 14:00" tem
 * resposta a um toque: tocar o dia abre a timeline daquele dia.
 *
 * ## Sem gesto
 *
 * A visão de mês é somente leitura. Não há arrasto para criar nem para mover —
 * não por limitação, mas porque em uma célula de 90 px o alvo de 15 minutos
 * teria menos de um pixel. Criar e mover moram no dia e na semana, onde o
 * tempo tem escala. Isso também mantém a grade do mês completamente fora da
 * disputa entre gesto e rolagem, que é onde estão os riscos do produto.
 */

/** Altura mínima de uma linha. Abaixo disso nem um título caberia. */
const MIN_ROW_HEIGHT = 92;
/** Quantos títulos cabem antes do "+N". */
const MAX_VISIBLE = 3;

/**
 * Abaixo desta largura de coluna, a célula troca títulos por pontos.
 *
 * Em um telefone de 360 dp cada coluna fica com ~51 px. Um título de 10 px ali
 * mostra umas seis letras — "Revisar…" vira "Revis…", que não identifica nada e
 * ainda ocupa três linhas da célula. O ponto é honesto sobre o que aquela
 * escala consegue comunicar: QUANTOS compromissos existem naquele dia. O que é
 * cada um continua a um toque, no dia.
 *
 * É o mesmo comportamento do Google Agenda no Android, e pela mesma razão.
 */
const COMPACT_COLUMN_WIDTH = 64;
/** Quantos pontos cabem em uma linha da célula estreita. */
const MAX_DOTS = 4;

type DaySummary = {
  readonly entries: readonly ScheduleBlockWithTask[];
  readonly minutes: number;
};

export function MonthGrid({
  monthStart,
  today,
  timeZone,
  entries,
  onOpenDay,
  isRefreshing = false,
  onRefresh,
}: {
  readonly monthStart: CalendarDate;
  readonly today: CalendarDate;
  readonly timeZone: string;
  readonly entries: readonly ScheduleBlockWithTask[];
  readonly onOpenDay: (date: CalendarDate) => void;
  readonly isRefreshing?: boolean;
  readonly onRefresh?: (() => void) | undefined;
}) {
  const colors = useThemeColors();

  const weeks = useMemo(() => monthWeeks(monthStart), [monthStart]);

  /**
   * A largura vem do LAYOUT, e não de `useWindowDimensions`: no desktop a barra
   * lateral de não agendadas já consumiu parte da tela, e a janela mentiria.
   */
  const [gridWidth, setGridWidth] = useState(0);
  const isCompact = gridWidth > 0 && gridWidth / DAYS_IN_WEEK < COMPACT_COLUMN_WIDTH;

  function handleLayout(event: LayoutChangeEvent): void {
    setGridWidth(event.nativeEvent.layout.width);
  }

  /**
   * Blocos agrupados pelo dia em que COMEÇAM, no fuso do usuário.
   *
   * Um bloco que atravessa a meia-noite conta uma vez, no dia em que começou.
   * Reparti-lo entre dois quadrados faria o mês dizer que há dois compromissos
   * onde há um — e no mês a contagem é justamente a informação.
   */
  const byDay = useMemo(() => {
    const map = new Map<CalendarDate, ScheduleBlockWithTask[]>();

    for (const entry of entries) {
      const date = toCalendarDateInTimeZone(entry.block.startsAt, timeZone);
      const list = map.get(date);
      if (list === undefined) map.set(date, [entry]);
      else list.push(entry);
    }

    const summaries = new Map<CalendarDate, DaySummary>();
    for (const [date, list] of map) {
      const sorted = [...list].sort(
        (a, b) => a.block.startsAt.getTime() - b.block.startsAt.getTime(),
      );
      summaries.set(date, {
        entries: sorted,
        minutes: sorted.reduce((total, entry) => total + blockDurationMinutes(entry.block), 0),
      });
    }

    return summaries;
  }, [entries, timeZone]);

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {/* Cabeçalho dos dias da semana, fixo. */}
      <View style={[styles.weekdays, { borderBottomColor: colors.border }]}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <Text variant="overline" muted style={styles.weekdayLabel}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh === undefined ? undefined : (
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          )
        }
      >
        {weeks.map((week) => (
          <View key={week[0]?.date} style={[styles.week, { borderBottomColor: colors.border }]}>
            {week.map((cell) => (
              <DayCell
                key={cell.date}
                cell={cell}
                isToday={cell.date === today}
                isCompact={isCompact}
                summary={byDay.get(cell.date)}
                onPress={() => onOpenDay(cell.date)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function DayCell({
  cell,
  isToday,
  isCompact,
  summary,
  onPress,
}: {
  readonly cell: MonthCell;
  readonly isToday: boolean;
  /** Coluna estreita: pontos em vez de títulos. Ver `COMPACT_COLUMN_WIDTH`. */
  readonly isCompact: boolean;
  readonly summary: DaySummary | undefined;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  const count = summary?.entries.length ?? 0;
  const visible = summary?.entries.slice(0, MAX_VISIBLE) ?? [];
  const hidden = count - visible.length;
  const dayNumber = String(Number(cell.date.slice(8, 10)));

  const label = [
    cell.date,
    count === 0 ? "sem blocos" : `${count} ${count === 1 ? "bloco" : "blocos"}`,
    summary === undefined ? null : `${formatMinutes(summary.minutes)} planejados`,
    isToday ? "hoje" : null,
  ]
    .filter((part) => part !== null)
    .join(", ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isToday }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cell,
        {
          borderRightColor: colors.border,
          backgroundColor: pressed
            ? colors.surfaceRaised
            : isToday
              ? colors.todayTint
              : "transparent",
        },
      ]}
    >
      {/* O número do dia: disco cheio só em hoje — um marcador, não enfeite. */}
      <View
        style={[
          styles.dayNumber,
          isToday && { backgroundColor: colors.accent },
        ]}
      >
        <Text
          variant="caption"
          allowFontScaling={false}
          style={{
            color: isToday
              ? colors.textInverted
              : cell.inMonth
                ? colors.text
                : colors.textMuted,
            fontWeight: isToday ? fontWeight.semibold : fontWeight.medium,
          }}
        >
          {dayNumber}
        </Text>
      </View>

      {isCompact ? (
        <View style={styles.dots}>
          {(summary?.entries ?? []).slice(0, MAX_DOTS).map((entry) => (
            <View
              key={entry.block.id}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    entry.task.status === "DONE" ? colors.borderStrong : colors.accent,
                  opacity: cell.inMonth ? 1 : 0.5,
                },
              ]}
            />
          ))}
          {count > MAX_DOTS ? (
            <Text variant="caption" muted allowFontScaling={false} style={styles.more}>
              +{count - MAX_DOTS}
            </Text>
          ) : null}
        </View>
      ) : (
      <View style={styles.events}>
        {visible.map((entry) => (
          <View
            key={entry.block.id}
            style={[
              styles.event,
              {
                backgroundColor:
                  entry.task.status === "DONE" ? colors.surfaceRaised : colors.brandSoft,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              allowFontScaling={false}
              style={[
                styles.eventLabel,
                {
                  color:
                    entry.task.status === "DONE" ? colors.textMuted : colors.brandText,
                },
                // Um dia vizinho é contexto, não conteúdo: ele mostra que há
                // algo ali sem competir com o mês que está sendo lido.
                !cell.inMonth && styles.outside,
              ]}
            >
              {entry.task.title}
            </Text>
          </View>
        ))}

        {hidden > 0 ? (
          <Text variant="caption" muted allowFontScaling={false} style={styles.more}>
            +{hidden}
          </Text>
        ) : null}
      </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  weekdays: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  weekdayCell: { flex: 1, alignItems: "center", paddingVertical: spacing.sm },
  weekdayLabel: { fontSize: fontSize.xxs },

  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xl },

  week: { flexDirection: "row", minHeight: MIN_ROW_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth },
  cell: {
    flex: 1,
    minWidth: 0,
    paddingTop: spacing.xs,
    paddingHorizontal: 3,
    gap: spacing.xxs,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: "stretch",
  },

  dayNumber: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    paddingHorizontal: spacing.xs,
  },

  events: { gap: 2 },
  dots: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
    paddingTop: 2,
  },
  dot: { width: 5, height: 5, borderRadius: radius.pill },
  event: { borderRadius: radius.xs, paddingHorizontal: 4, paddingVertical: 2 },
  eventLabel: { fontSize: fontSize.xxs, fontWeight: fontWeight.medium },
  outside: { opacity: 0.55 },
  more: { fontSize: fontSize.xxs, paddingLeft: 4 },
});
