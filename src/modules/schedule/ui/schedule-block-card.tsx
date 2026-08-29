import { Pressable, StyleSheet, View } from "react-native";

import { formatMinutes, formatTimeRangeInTimeZone } from "@/lib/time";
import { fontSize, fontWeight, radius, spacing, timeline } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

import { blockDurationMinutes, type ScheduleBlockWithTask } from "../domain/schedule-block";
import type { PositionedBlock } from "../domain/timeline";

/**
 * Um bloco desenhado na timeline.
 *
 * O card carrega a informação que responde "o que é isso e quanto tempo leva":
 * título, intervalo e duração. Prioridade e prazo ficam de fora — quem está
 * lendo a agenda quer o dia, não a ficha da tarefa; esses dados aparecem ao
 * abrir o bloco.
 *
 * A posição vem PRONTA do domínio (`layoutBlocks`): este componente não decide
 * sobreposição, só traduz minutos em pixels.
 */
export function ScheduleBlockCard({
  positioned,
  timeZone,
  windowStartMinute,
  onPress,
}: {
  readonly positioned: PositionedBlock<ScheduleBlockWithTask & { readonly id: string }>;
  readonly timeZone: string;
  readonly windowStartMinute: number;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  const { item, startMinute, endMinute, lane, laneCount, hasConflict } = positioned;
  const { block, task } = item;
  const isDone = task.status === "DONE";

  const top = (startMinute - windowStartMinute) * timeline.day.pixelsPerMinute;
  const height = Math.max(
    (endMinute - startMinute) * timeline.day.pixelsPerMinute,
    timeline.day.minBlockHeight,
  );

  // Blocos que se sobrepõem dividem a largura em colunas iguais — assim nenhum
  // deles desaparece atrás do outro.
  const widthPercent = 100 / laneCount;

  const durationMinutes = blockDurationMinutes(block);
  const range = formatTimeRangeInTimeZone(block.startsAt, block.endsAt, timeZone);

  return (
    <View
      style={[
        styles.slot,
        {
          top,
          height,
          left: `${lane * widthPercent}%`,
          width: `${widthPercent}%`,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${range}, ${formatMinutes(durationMinutes)}${
          isDone ? ", concluída" : ""
        }${hasConflict ? ", em conflito com outro bloco" : ""}`}
        accessibilityHint="Abre as ações do bloco"
        onPress={onPress}
        // O toque escurece a borda em vez de esmaecer o card: em bloco pequeno
        // a opacidade tirava contraste justamente de quem já tem pouco texto.
        style={({ pressed }) => [
          styles.card,
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
        {/* Faixa lateral: identidade do bloco e, em conflito, o alerta. */}
        <View
          style={[
            styles.spine,
            { backgroundColor: hasConflict ? colors.warning : isDone ? colors.borderStrong : colors.accent },
          ]}
        />

        <View style={styles.body}>
          <Text
            numberOfLines={height < 72 ? 1 : 2}
            style={[
              styles.title,
              { color: isDone ? colors.textMuted : colors.brandText },
              isDone && styles.done,
            ]}
          >
            {task.title}
          </Text>

          {height >= timeline.day.rangeVisibleHeight ? (
            <Text
              variant="caption"
              numberOfLines={1}
              style={[styles.range, { color: isDone ? colors.textMuted : colors.brandText }]}
            >
              {range} · {formatMinutes(durationMinutes)}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: "absolute", paddingRight: timeline.day.laneGap },
  card: {
    flex: 1,
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  spine: { width: 3 },
  body: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
    justifyContent: "center",
  },
  title: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  // Levemente translúcido: o horário é contexto, o título é a informação.
  range: { opacity: 0.85 },
  done: { textDecorationLine: "line-through" },
});
