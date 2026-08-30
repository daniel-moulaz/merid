import { Text as RNText, StyleSheet, type TextProps } from "react-native";

import { useThemeColors } from "@/theme/use-theme";
import { fontSize, fontWeight, lineHeight } from "@/theme/tokens";

/**
 * Tipografia do produto.
 *
 * ## Por que altura de linha entrou aqui
 *
 * O React Native não aplica altura de linha nenhuma por padrão: cada plataforma
 * usa a métrica da própria fonte, que é apertada. Em uma linha só não se nota;
 * em um título que quebra, na descrição de uma tarefa ou em qualquer texto de
 * duas linhas, o resultado é o texto colado — que era boa parte da sensação de
 * "cru" do aplicativo. Agora cada variante carrega a altura correspondente ao
 * seu papel: títulos justos, corpo generoso.
 *
 * ## `overline`
 *
 * Variante nova para os rótulos de seção ("NÃO AGENDADAS", "ESTA SEMANA"), que
 * estavam sendo montados à mão em cada tela com `variant="label"` mais
 * `letterSpacing` solto e `toUpperCase()` no meio do JSX. Agora existe um só
 * lugar que decide como um rótulo de seção se parece.
 */

type Variant = "title" | "heading" | "subheading" | "body" | "label" | "caption" | "overline";

const VARIANT_STYLES = StyleSheet.create({
  title: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.4,
  },
  heading: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.2,
  },
  subheading: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: fontWeight.semibold,
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontWeight: fontWeight.regular,
  },
  label: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontWeight: fontWeight.medium,
  },
  caption: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: fontWeight.regular,
  },
  overline: {
    fontSize: fontSize.xs,
    lineHeight: lineHeight.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});

export type AppTextProps = TextProps & {
  readonly variant?: Variant;
  readonly muted?: boolean;
  readonly tone?: "default" | "danger" | "success" | "accent";
};

export function Text({
  variant = "body",
  muted = false,
  tone = "default",
  style,
  ...rest
}: AppTextProps) {
  const colors = useThemeColors();

  const color =
    tone === "danger"
      ? colors.danger
      : tone === "success"
        ? colors.success
        : tone === "accent"
          ? colors.accent
          : muted
            ? colors.textMuted
            : colors.text;

  return <RNText {...rest} style={[VARIANT_STYLES[variant], { color }, style]} />;
}
