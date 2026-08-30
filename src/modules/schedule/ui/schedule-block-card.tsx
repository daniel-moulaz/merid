import { Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, type GestureType } from "react-native-gesture-handler";

import { formatMinutes, formatTimeRangeInTimeZone, minutesToTimeOfDay } from "@/lib/time";
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
  moveGesture,
  movedTo,
}: {
  readonly positioned: PositionedBlock<ScheduleBlockWithTask & { readonly id: string }>;
  readonly timeZone: string;
  readonly windowStartMinute: number;
  readonly onPress: () => void;
  /** Gesto de arrastar para outro horário, quando o bloco permite. */
  readonly moveGesture?: GestureType | undefined;
  /** Horário provisório enquanto o dedo arrasta. `null` = parado. */
  readonly movedTo?: { readonly startMinute: number; readonly endMinute: number } | null;
}) {
  const colors = useThemeColors();

  const { item, startMinute, endMinute, lane, laneCount, hasConflict } = positioned;
  const { block, task } = item;
  const isDone = task.status === "DONE";

  // Durante o arrasto o cartão se desenha no horário provisório: ele PRÓPRIO é
  // o preview, o que evita um segundo retângulo competindo com o original.
  const drawnStart = movedTo?.startMinute ?? startMinute;
  const drawnEnd = movedTo?.endMinute ?? endMinute;
  const isMoving = movedTo != null;

  const top = (drawnStart - windowStartMinute) * timeline.day.pixelsPerMinute;
  const height = Math.max(
    (drawnEnd - drawnStart) * timeline.day.pixelsPerMinute,
    timeline.day.minBlockHeight,
  );

  // Blocos que se sobrepõem dividem a largura em colunas iguais — assim nenhum
  // deles desaparece atrás do outro.
  const widthPercent = 100 / laneCount;

  const durationMinutes = blockDurationMinutes(block);
  // Enquanto arrasta, o cartão anuncia o horário PROVISÓRIO — ler o antigo
  // enquanto o bloco já está em outro lugar seria a tela contradizendo o dedo.
  const range = isMoving
    ? `${minutesToTimeOfDay(drawnStart % MINUTES_IN_DAY)} → ${minutesToTimeOfDay(drawnEnd % MINUTES_IN_DAY)}`
    : formatTimeRangeInTimeZone(block.startsAt, block.endsAt, timeZone);

  const card = (
    <View
      style={[
        styles.slot,
        isMoving && styles.moving,
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

  // Sem gesto (bloco que atravessa a meia-noite, ou plataforma sem toque) o
  // cartão é exatamente o que sempre foi.
  return moveGesture === undefined ? card : <GestureDetector gesture={moveGesture}>{card}</GestureDetector>;
}

const MINUTES_IN_DAY = 1440;

const styles = StyleSheet.create({
  slot: { position: "absolute", paddingRight: timeline.day.laneGap },
  // Enquanto arrasta, o cartão sobe acima dos vizinhos e ganha um leve relevo:
  // é a única pista de que ele está "na mão" e ainda não foi salvo.
  moving: { zIndex: 10, opacity: 0.92 },
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
