import { Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, type GestureType } from "react-native-gesture-handler";

import { formatCalendarDate, minutesToTimeOfDay } from "@/lib/time";
import { fontSize, fontWeight, radius, spacing, timeline } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import type { Task } from "@/modules/tasks/domain/task";
import { Text } from "@/ui/text";

import type { Packed } from "../domain/lane-packing";
import type { DaySegment } from "../domain/week";

const WEEK = timeline.week;

export type PositionedSegment = Packed<DaySegment> & { readonly task: Task };

/**
 * Um segmento de bloco na grade semanal.
 *
 * Coluna estreita muda a hierarquia: o TÍTULO é a única informação garantida.
 * Horário e duração só aparecem quando a altura permite — um bloco de 20 min
 * com três linhas espremidas não comunica nada.
 *
 * Um bloco que atravessa a meia-noite aparece como dois segmentos, e cada um
 * perde o arredondamento do lado por onde continua: a forma sozinha diz que
 * aquilo prossegue no dia vizinho, sem precisar de texto.
 */
export function WeekBlockCard({
  positioned,
  windowStartMinute,
  columnWidth,
  onPress,
  moveGesture,
  movedTo,
}: {
  readonly positioned: PositionedSegment;
  readonly windowStartMinute: number;
  readonly columnWidth: number;
  readonly onPress: () => void;
  /** Arrastar para outro horário. Ausente em segmentos de bloco partido. */
  readonly moveGesture?: GestureType | undefined;
  readonly movedTo?: { readonly startMinute: number; readonly endMinute: number } | null;
}) {
  const colors = useThemeColors();

  const { startMinute, endMinute, lane, laneCount, hasConflict, task } = positioned;
  const isDone = task.status === "DONE";

  // Durante o arrasto o próprio cartão é o preview — ver `schedule-block-card`.
  const drawnStart = movedTo?.startMinute ?? startMinute;
  const drawnEnd = movedTo?.endMinute ?? endMinute;
  const isMoving = movedTo != null;

  const top = (drawnStart - windowStartMinute) * WEEK.pixelsPerMinute;
  const height = Math.max((drawnEnd - drawnStart) * WEEK.pixelsPerMinute, WEEK.minBlockHeight);

  // Colunas visíveis são limitadas: o excedente é anunciado por um "+N", e não
  // espremido até virar uma tira ilegível. Ver `WeekOverflowChip`.
  const visibleLanes = Math.min(laneCount, WEEK.maxLanes);
  const widthPercent = 100 / visibleLanes;

  const showsRange = height >= WEEK.rangeVisibleHeight && columnWidth >= WEEK.minColumnWidth;

  const range = `${minutesToTimeOfDay(drawnStart % 1440)} → ${minutesToTimeOfDay(drawnEnd % 1440)}`;

  const card = (
    <View
      style={[
        styles.slot,
        isMoving && styles.moving,
        { top, height, left: `${lane * widthPercent}%`, width: `${widthPercent}%` },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel(positioned)}
        accessibilityHint="Abre as ações do bloco"
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          positioned.continuesBefore && styles.continuesBefore,
          positioned.continuesAfter && styles.continuesAfter,
          {
            backgroundColor: isDone ? colors.surfaceRaised : colors.brandSoft,
            borderColor: pressed
              ? colors.accent
              : isDone
                ? colors.border
                : colors.brandBorder,
          },
        ]}
      >
        <View
          style={[
            styles.spine,
            {
              backgroundColor: hasConflict
                ? colors.warning
                : isDone
                  ? colors.borderStrong
                  : colors.accent,
            },
          ]}
        />

        <View style={styles.body}>
          <Text
            numberOfLines={height >= WEEK.rangeVisibleHeight ? 2 : 1}
            style={[
              styles.title,
              { color: isDone ? colors.textMuted : colors.brandText },
              isDone && styles.done,
            ]}
          >
            {task.title}
          </Text>

          {showsRange ? (
            <Text
              variant="caption"
              numberOfLines={1}
              style={[styles.range, { color: isDone ? colors.textMuted : colors.brandText }]}
            >
              {range}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );

  return moveGesture === undefined ? card : <GestureDetector gesture={moveGesture}>{card}</GestureDetector>;
}

/**
 * "Estudar AEDS, quarta-feira, 14:00 até 15:30, concluída."
 *
 * Em um calendário o rótulo precisa carregar o DIA: quem navega por leitor de
 * tela não tem a coluna como contexto.
 */
function accessibilityLabel(positioned: PositionedSegment): string {
  const { task, date, startMinute, endMinute, continuesBefore, continuesAfter } = positioned;

  const weekday = formatCalendarDate(date, { weekday: "long", day: "numeric", month: "long" });
  const from = minutesToTimeOfDay(startMinute);
  const to = minutesToTimeOfDay(endMinute % 1440);

  const parts = [task.title, weekday, `${from} até ${to}`];
  if (continuesBefore) parts.push("continuação do dia anterior");
  if (continuesAfter) parts.push("continua no dia seguinte");
  if (task.status === "DONE") parts.push("concluída");
  if (positioned.hasConflict) parts.push("em conflito com outro bloco");

  return parts.join(", ");
}

/**
 * Marcador de blocos que não couberam nas colunas visíveis.
 *
 * Em vez de espremer cinco blocos simultâneos até nenhum ser legível, a grade
 * mostra os primeiros e anuncia o resto. Tocar abre aquele dia na tela Hoje,
 * que tem largura para mostrar todos — reaproveitando uma tela que já existe
 * em vez de inventar outra folha.
 */
export function WeekOverflowChip({
  count,
  date,
  top,
  onPress,
}: {
  readonly count: number;
  readonly date: string;
  readonly top: number;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.slot, styles.overflowSlot, { top }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Mais ${count} ${count === 1 ? "bloco" : "blocos"} neste horário em ${formatCalendarDate(date, { weekday: "long" })}. Abre o dia.`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.overflow,
          {
            backgroundColor: pressed ? colors.accent : colors.surfaceRaised,
            borderColor: colors.borderStrong,
          },
        ]}
      >
        <Text variant="caption" style={styles.overflowLabel}>
          +{count}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: "absolute", paddingRight: WEEK.laneGap },
  moving: { zIndex: 10, opacity: 0.92 },
  card: {
    flex: 1,
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  // Lado por onde o bloco continua no dia vizinho: sem canto, sugerindo corte.
  continuesBefore: { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0 },
  continuesAfter: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 },

  spine: { width: 2.5 },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    gap: 1,
    justifyContent: "center",
  },
  title: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  range: { opacity: 0.85, fontSize: fontSize.xxs },
  done: { textDecorationLine: "line-through" },

  overflowSlot: { right: 0, height: 18 },
  overflow: {
    position: "absolute",
    right: WEEK.laneGap,
    minWidth: 22,
    height: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  overflowLabel: { fontSize: fontSize.xxs, fontWeight: fontWeight.semibold },
});
