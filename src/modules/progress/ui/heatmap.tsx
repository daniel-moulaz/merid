import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { formatCalendarDate, formatMinutes, type CalendarDate } from "@/lib/time";
import { activityColor, fontSize, heatmap as HEATMAP, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

import { activityLevelLabel } from "../domain/activity";
import { monthLabels, type HeatmapCell, type HeatmapWeek } from "../domain/heatmap";

/**
 * O mapa de atividade.
 *
 * ## Duas orientações, uma matriz
 *
 * Sete linhas por cinquenta colunas é um retângulo deitado — ótimo num monitor,
 * impossível num telefone de 360 dp, onde as células virariam poeira ou
 * exigiriam uma rolagem horizontal aninhada brigando com a rolagem vertical da
 * tela.
 *
 * Então a mesma matriz é desenhada de dois jeitos. No telefone as SEMANAS são
 * linhas e os DIAS são as sete colunas: a grade cresce para baixo e rola junto
 * com a página, cada célula fica com ~34 dp — um alvo de toque de verdade — e
 * o resultado se parece com um calendário, que é o vocabulário do produto. No
 * desktop volta a orientação clássica, que aproveita a largura para mostrar o
 * ano inteiro de uma vez.
 *
 * A diferença entre as duas é a direção do flex. Nenhuma lógica é duplicada:
 * `buildHeatmapWeeks` produz a mesma estrutura para as duas.
 */
export function Heatmap({
  weeks,
  orientation,
  selectedDate,
  onSelectDate,
  cellSize,
  currentYear,
}: {
  readonly weeks: readonly HeatmapWeek[];
  readonly orientation: "stacked" | "wide";
  readonly selectedDate: CalendarDate | null;
  readonly onSelectDate: (date: CalendarDate) => void;
  /** Só no empilhado: a largura disponível decide o tamanho da célula. */
  readonly cellSize?: number;
  /** "AAAA" de hoje — decide se o rótulo da célula precisa dizer o ano. */
  readonly currentYear: string;
}) {
  return orientation === "stacked" ? (
    <StackedHeatmap
      weeks={weeks}
      selectedDate={selectedDate}
      onSelectDate={onSelectDate}
      cellSize={cellSize ?? HEATMAP.stacked.cell}
      currentYear={currentYear}
    />
  ) : (
    <WideHeatmap
      weeks={weeks}
      selectedDate={selectedDate}
      onSelectDate={onSelectDate}
      currentYear={currentYear}
    />
  );
}

/**
 * Nomes dos dias, na ordem da semana do produto (segunda primeiro).
 *
 * Abreviação de três letras, e não a inicial: em português a inicial produz
 * S, T, Q, Q, S, S, D — três "S" e dois "Q", o que não identifica nada.
 */
function weekdayLabels(week: HeatmapWeek | undefined): string[] {
  if (week === undefined) return [];
  return week.days.map((day) =>
    formatCalendarDate(day.date, { weekday: "short" }).replace(".", ""),
  );
}

/* -------------------------------------------------------------------------- */
/* Telefone: semanas para baixo                                                */
/* -------------------------------------------------------------------------- */

function StackedHeatmap({
  weeks,
  selectedDate,
  onSelectDate,
  cellSize,
  currentYear,
}: {
  readonly weeks: readonly HeatmapWeek[];
  readonly selectedDate: CalendarDate | null;
  readonly onSelectDate: (date: CalendarDate) => void;
  readonly cellSize: number;
  readonly currentYear: string;
}) {
  const colors = useThemeColors();
  const labels = useMemo(() => weekdayLabels(weeks.at(0)), [weeks]);

  // Mais recente em cima: o que a pessoa quer ver primeiro é a semana atual,
  // não a de onze meses atrás.
  const ordered = useMemo(() => [...weeks].reverse(), [weeks]);

  return (
    <View>
      <View style={[styles.stackedRow, { gap: HEATMAP.stacked.gap }]}>
        {labels.map((label, index) => (
          <Text
            key={index}
            variant="caption"
            muted
            allowFontScaling={false}
            style={[styles.weekdayLabel, { width: cellSize }]}
          >
            {label}
          </Text>
        ))}
      </View>

      {ordered.map((week) => (
        <View key={week.start} style={[styles.stackedRow, { gap: HEATMAP.stacked.gap }]}>
          {week.days.map((cell) => (
            <Cell
              key={cell.date}
              cell={cell}
              size={cellSize}
              isSelected={cell.date === selectedDate}
              onPress={onSelectDate}
              currentYear={currentYear}
            />
          ))}

          {/* O mês aparece na linha em que ele começa, à direita da semana:
              rotular toda linha viraria uma coluna de repetições. */}
          <MonthTick week={week} color={colors.textMuted} />
        </View>
      ))}
    </View>
  );
}

function MonthTick({ week, color }: { readonly week: HeatmapWeek; readonly color: string }) {
  const startsMonth = week.days.some((day) => day.date.endsWith("-01"));
  if (!startsMonth) return <View style={styles.monthTick} />;

  const first = week.days.find((day) => day.date.endsWith("-01"));

  return (
    <View style={styles.monthTick}>
      <Text variant="caption" allowFontScaling={false} style={{ color }} numberOfLines={1}>
        {first === undefined
          ? ""
          : formatCalendarDate(first.date, { month: "short" }).replace(".", "")}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Desktop: semanas para o lado                                               */
/* -------------------------------------------------------------------------- */

function WideHeatmap({
  weeks,
  selectedDate,
  onSelectDate,
  currentYear,
}: {
  readonly weeks: readonly HeatmapWeek[];
  readonly selectedDate: CalendarDate | null;
  readonly onSelectDate: (date: CalendarDate) => void;
  readonly currentYear: string;
}) {
  const colors = useThemeColors();
  const labels = useMemo(() => weekdayLabels(weeks.at(0)), [weeks]);
  const months = useMemo(() => monthLabels(weeks), [weeks]);

  const step = HEATMAP.wide.cell + HEATMAP.wide.gap;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        {/* Régua de meses, posicionada por índice de semana. */}
        <View style={[styles.monthAxis, { marginLeft: WEEKDAY_GUTTER }]}>
          {months.map((month) => (
            <Text
              key={month.weekIndex}
              variant="caption"
              muted
              allowFontScaling={false}
              style={[styles.monthAxisLabel, { left: month.weekIndex * step }]}
            >
              {month.label}
            </Text>
          ))}
        </View>

        <View style={styles.wideBody}>
          {/* Só dias alternados: sete rótulos em 13 px cada ficariam ilegíveis. */}
          <View style={{ width: WEEKDAY_GUTTER, gap: HEATMAP.wide.gap }}>
            {labels.map((label, index) => (
              <View key={index} style={{ height: HEATMAP.wide.cell, justifyContent: "center" }}>
                {index % 2 === 1 ? (
                  <Text
                    variant="caption"
                    muted
                    allowFontScaling={false}
                    style={styles.wideWeekdayLabel}
                  >
                    {label}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          <View style={[styles.wideWeeks, { gap: HEATMAP.wide.gap }]}>
            {weeks.map((week) => (
              <View key={week.start} style={{ gap: HEATMAP.wide.gap }}>
                {week.days.map((cell) => (
                  <Cell
                    key={cell.date}
                    cell={cell}
                    size={HEATMAP.wide.cell}
                    isSelected={cell.date === selectedDate}
                    onPress={onSelectDate}
                    currentYear={currentYear}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>

        <Legend color={colors.textMuted} />
      </View>
    </ScrollView>
  );
}

const WEEKDAY_GUTTER = 22;

/* -------------------------------------------------------------------------- */

/**
 * Uma célula.
 *
 * O dia futuro não é pressionável nem entra na árvore de acessibilidade: ele é
 * espaço reservado, e anunciar "5 de setembro, sem conclusões" para um dia que
 * ainda não chegou seria informação falsa.
 */
function Cell({
  cell,
  size,
  isSelected,
  onPress,
  currentYear,
}: {
  readonly cell: HeatmapCell;
  readonly size: number;
  readonly isSelected: boolean;
  readonly onPress: (date: CalendarDate) => void;
  readonly currentYear: string;
}) {
  const colors = useThemeColors();

  if (cell.isFuture) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.cell, styles.future, { width: size, height: size }]}
      />
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={cellLabel(cell, currentYear)}
      onPress={() => onPress(cell.date)}
      style={({ pressed }) => [
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor: activityColor(cell.level, colors),
          opacity: pressed ? 0.7 : 1,
        },
        // Hoje ganha um anel permanente; o selecionado, um anel de destaque.
        cell.isToday && { borderWidth: 1.5, borderColor: colors.borderStrong },
        isSelected && { borderWidth: 2, borderColor: colors.text },
      ]}
    />
  );
}

/**
 * "29 de agosto, 2h15 em 3 tarefas."
 *
 * O ANO entra quando não é o corrente. A janela cobre doze meses, então o
 * mesmo dia e mês aparecem DUAS vezes na grade — "27 de agosto" sozinho seria
 * ambíguo justamente para quem navega por leitor de tela e não tem a posição
 * na grade como pista.
 */
export function cellLabel(cell: HeatmapCell, currentYear: string): string {
  const date = formatCalendarDate(
    cell.date,
    cell.date.startsWith(currentYear)
      ? { day: "numeric", month: "long" }
      : { day: "numeric", month: "long", year: "numeric" },
  );

  if (cell.minutes === 0) {
    return `${date}, sem conclusões${cell.isToday ? ", hoje" : ""}`;
  }

  const tasks = `${cell.tasks} ${cell.tasks === 1 ? "tarefa" : "tarefas"}`;
  return `${date}, ${formatMinutes(cell.minutes)} em ${tasks}${cell.isToday ? ", hoje" : ""}`;
}

/** Legenda da escala. Sem ela a cor é decoração; com ela, informação. */
export function Legend({ color }: { readonly color: string }) {
  const colors = useThemeColors();
  const levels = [0, 1, 2, 3, 4] as const;

  return (
    <View
      style={styles.legend}
      accessibilityRole="text"
      accessibilityLabel={`Escala: ${levels.map((level) => activityLevelLabel(level)).join(", ")}.`}
    >
      <Text variant="caption" allowFontScaling={false} style={{ color }}>
        menos
      </Text>
      {levels.map((level) => (
        <View
          key={level}
          style={[
            styles.legendCell,
            { backgroundColor: activityColor(level, colors), borderColor: colors.border },
          ]}
        />
      ))}
      <Text variant="caption" allowFontScaling={false} style={{ color }}>
        mais
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { borderRadius: HEATMAP.radius },
  future: { opacity: 0.35, borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent" },

  stackedRow: {
    flexDirection: "row",
    marginBottom: HEATMAP.stacked.gap,
    alignItems: "center",
  },
  weekdayLabel: { textAlign: "center", fontSize: fontSize.xxs },
  monthTick: { width: 34, paddingLeft: spacing.xs, justifyContent: "center" },

  monthAxis: { height: 16, flexDirection: "row" },
  monthAxisLabel: { position: "absolute", fontSize: fontSize.xxs },
  wideBody: { flexDirection: "row", gap: spacing.xs },
  wideWeekdayLabel: { fontSize: 9, lineHeight: fontSize.xs },
  wideWeeks: { flexDirection: "row" },

  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.sm,
    alignSelf: "flex-end",
  },
  legendCell: {
    width: 11,
    height: 11,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
