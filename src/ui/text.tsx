import { Text as RNText, StyleSheet, type TextProps } from "react-native";

import { useThemeColors } from "@/theme/use-theme";
import { fontSize, fontWeight } from "@/theme/tokens";

type Variant = "title" | "heading" | "body" | "label" | "caption";

const VARIANT_STYLES = StyleSheet.create({
  title: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, letterSpacing: -0.5 },
  heading: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.md, fontWeight: fontWeight.regular },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  caption: { fontSize: fontSize.xs, fontWeight: fontWeight.regular },
});

export type AppTextProps = TextProps & {
  readonly variant?: Variant;
  readonly muted?: boolean;
  readonly tone?: "default" | "danger" | "success";
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
        : muted
          ? colors.textMuted
          : colors.text;

  return <RNText {...rest} style={[VARIANT_STYLES[variant], { color }, style]} />;
}
