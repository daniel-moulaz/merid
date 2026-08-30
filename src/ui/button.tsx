import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
} from "react-native";

import { control, fontSize, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { Text } from "./text";

/**
 * Botão.
 *
 * ## Por que existe `size`
 *
 * Antes havia uma altura só. Um "Adicionar" de largura total e um "Editar"
 * dentro de uma linha de lista usavam a mesma caixa de 44 dp, e as telas
 * compensavam sobrescrevendo `minHeight` e `paddingHorizontal` por fora —
 * `task-list-item` e `unscheduled-task-row` faziam exatamente isso, com
 * números diferentes. O resultado eram botões de cinco alturas distintas no
 * mesmo aplicativo.
 *
 * Agora os três tamanhos moram aqui:
 *
 *   `lg`  ação principal de uma tela ou de uma folha (largura total)
 *   `md`  padrão
 *   `sm`  ação dentro de uma linha de lista
 *
 * O `sm` fica abaixo dos 44 dp de alvo mínimo, e isso é deliberado: ele só
 * aparece em linhas de lista, onde a altura da própria linha já entrega o alvo.
 * `hitSlop` completa o que falta.
 */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  readonly label: string;
  readonly variant?: Variant;
  readonly size?: Size;
  readonly loading?: boolean;
  readonly style?: ViewStyle;
};

const SIZES = StyleSheet.create({
  sm: { minHeight: 34, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  md: { minHeight: control.chipHeight, paddingHorizontal: spacing.md },
  lg: { minHeight: control.minTouch, paddingHorizontal: spacing.lg },
});

const LABEL_SIZES = StyleSheet.create({
  sm: { fontSize: fontSize.xs },
  md: { fontSize: fontSize.sm },
  lg: { fontSize: fontSize.sm },
});

export function Button({
  label,
  variant = "primary",
  size = "lg",
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const colors = useThemeColors();
  const isDisabled = disabled === true || loading;

  const background =
    variant === "primary"
      ? colors.accent
      : variant === "danger"
        ? colors.danger
        : variant === "secondary"
          ? colors.surfaceRaised
          : "transparent";

  const textColor =
    variant === "primary" || variant === "danger" ? colors.textInverted : colors.text;

  // O contorno do `secondary` vem da borda neutra, e não da própria cor de
  // fundo: sem isso ele desaparecia contra a superfície das folhas e dos
  // cartões, que usam exatamente o mesmo cinza.
  const borderColor =
    variant === "ghost"
      ? "transparent"
      : variant === "secondary"
        ? colors.border
        : background;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={size === "sm" ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        SIZES[size],
        {
          backgroundColor: background,
          borderColor,
          opacity: isDisabled ? 0.45 : pressed ? 0.82 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text
          numberOfLines={1}
          style={[styles.label, LABEL_SIZES[size], { color: textColor }]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontWeight: fontWeight.medium },
});
