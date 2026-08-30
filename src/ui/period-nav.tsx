import { Pressable, StyleSheet, View } from "react-native";

import { control, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { Text } from "./text";

/**
 * Navegação de período: anterior · voltar para agora · próximo.
 *
 * Estava duplicada palavra por palavra em Hoje e na Agenda, com um comentário
 * dizendo que valeria extrair "se aparecer uma terceira". Apareceu — a visão
 * de mês —, e com ela a terceira cópia da mesma seta desenhada. Agora é um
 * componente só, e as três telas navegam exatamente igual: muda apenas a
 * UNIDADE do passo, que é a única diferença real entre elas.
 *
 * O botão do meio só existe quando há para onde voltar. Ele aparecer sempre
 * ocuparia largura anunciando uma ação sem efeito, e some sozinho quando a
 * pessoa já está no período atual.
 *
 * As setas são desenhadas com borda, e não com os glifos "‹" e "›": as métricas
 * tipográficas variam entre as fontes de sistema e no Android as duas saíam com
 * pesos e alinhamentos diferentes.
 */
export function PeriodNav({
  onPrevious,
  onNext,
  onReset,
  showReset,
  previousLabel,
  nextLabel,
  resetLabel,
  resetAccessibilityLabel,
}: {
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onReset: () => void;
  /** `false` quando já se está no período atual: o botão do meio some. */
  readonly showReset: boolean;
  readonly previousLabel: string;
  readonly nextLabel: string;
  /** Texto curto do botão do meio, ex.: "Hoje". */
  readonly resetLabel: string;
  readonly resetAccessibilityLabel: string;
}) {
  const colors = useThemeColors();

  return (
    <View style={[styles.group, { borderColor: colors.border }]}>
      <Arrow direction="previous" label={previousLabel} onPress={onPrevious} />

      {showReset ? (
        <>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={resetAccessibilityLabel}
            onPress={onReset}
            style={({ pressed }) => [
              styles.reset,
              { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
            ]}
          >
            <Text variant="caption" style={{ color: colors.accent, fontWeight: fontWeight.semibold }}>
              {resetLabel}
            </Text>
          </Pressable>
        </>
      ) : null}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Arrow direction="next" label={nextLabel} onPress={onNext} />
    </View>
  );
}

function Arrow({
  direction,
  label,
  onPress,
}: {
  readonly direction: "previous" | "next";
  readonly label: string;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrowButton,
        { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
      ]}
    >
      <View
        style={[
          styles.arrow,
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
  group: {
    flexDirection: "row",
    alignItems: "stretch",
    height: control.minTouch,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  divider: { width: StyleSheet.hairlineWidth },
  arrowButton: {
    width: control.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: {
    width: 9,
    height: 9,
    borderTopWidth: control.strokeWidth,
    borderRightWidth: control.strokeWidth,
  },
  reset: {
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
