import { StyleSheet, View } from "react-native";

import { formatMinutes, minutesToTimeOfDay } from "@/lib/time";
import { fontSize, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

import {
  offsetOfMinute,
  selectionDuration,
  type IntervalSelection,
} from "../domain/interval-selection";

/**
 * O intervalo sendo desenhado pelo gesto.
 *
 * ## O que precisa estar visível durante o arrasto
 *
 * As duas pontas e a duração — e as três ao mesmo tempo, porque respondem a
 * perguntas diferentes: "onde isto começa", "onde termina" e "quanto tempo eu
 * acabei de reservar". Sem a duração o gesto vira aritmética mental no meio de
 * um arrasto.
 *
 * Os horários ficam nas BORDAS, alinhados às linhas que o intervalo toca, e
 * não centralizados: é na borda que a pessoa está mirando. A duração fica no
 * meio, que é o único lugar que sobra em um bloco curto.
 *
 * ## Por que não é um cartão
 *
 * O preview não é um bloco: é uma intenção. Ele usa a cor da marca com
 * preenchimento translúcido e borda tracejada — a mesma família visual dos
 * blocos reais, e uma forma que ninguém confunde com algo já salvo. Nada de
 * sombra, escala ou animação: o que precisa se mover durante o gesto é a
 * seleção, e qualquer outro movimento competiria com ela.
 */
export function SelectionPreview({
  selection,
  windowStartMinute,
  pixelsPerMinute,
  compact = false,
}: {
  readonly selection: IntervalSelection;
  readonly windowStartMinute: number;
  readonly pixelsPerMinute: number;
  /** Coluna estreita da semana: só a duração cabe. */
  readonly compact?: boolean;
}) {
  const colors = useThemeColors();

  const top = offsetOfMinute(selection.startMinute, windowStartMinute, pixelsPerMinute);
  const height = Math.max(
    (selection.endMinute - selection.startMinute) * pixelsPerMinute,
    MIN_VISIBLE_HEIGHT,
  );

  const duration = formatMinutes(selectionDuration(selection));
  const from = minutesToTimeOfDay(selection.startMinute % MINUTES_PER_DAY);
  const to = minutesToTimeOfDay(selection.endMinute % MINUTES_PER_DAY);

  return (
    <View
      // Puramente decorativo: quem usa leitor de tela não está arrastando, e
      // anunciar um retângulo que muda quinze vezes por gesto seria ruído. O
      // resultado é anunciado pelo formulário, que é onde ele importa.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.preview,
        {
          top,
          height,
          borderColor: colors.accent,
          backgroundColor: colors.brandSoft,
        },
      ]}
    >
      {compact ? (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.duration, styles.durationCompact, { color: colors.brandText }]}
        >
          {duration}
        </Text>
      ) : (
        <>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[styles.edge, { color: colors.brandText }]}
          >
            {from}
          </Text>

          {height >= DURATION_VISIBLE_HEIGHT ? (
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.duration, { color: colors.brandText }]}
            >
              {duration}
            </Text>
          ) : null}

          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={[styles.edge, styles.edgeBottom, { color: colors.brandText }]}
          >
            {to}
          </Text>
        </>
      )}
    </View>
  );
}

const MINUTES_PER_DAY = 1440;
/** Um intervalo mínimo ainda precisa ser visto. */
const MIN_VISIBLE_HEIGHT = 22;
/** Abaixo disto, horário e duração empilhados não caberiam sem se sobrepor. */
const DURATION_VISIBLE_HEIGHT = 56;

const styles = StyleSheet.create({
  preview: {
    // Puramente decorativo: o preview nunca deve capturar o gesto que o desenha.
    pointerEvents: "none",
    position: "absolute",
    left: 0,
    right: 0,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: radius.sm,
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    overflow: "hidden",
  },
  edge: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  edgeBottom: { textAlign: "right" },
  duration: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textAlign: "center",
  },
  durationCompact: { flex: 1, textAlignVertical: "center" },
});
