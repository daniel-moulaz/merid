import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type ViewStyle,
} from "react-native";

import { fontSize, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { Text } from "./text";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = Omit<PressableProps, "style" | "children"> & {
  readonly label: string;
  readonly variant?: Variant;
  readonly loading?: boolean;
  readonly style?: ViewStyle;
};

export function Button({
  label,
  variant = "primary",
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
    variant === "primary"
      ? colors.textInverted
      : variant === "danger"
        ? colors.textInverted
        : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderColor: variant === "ghost" ? "transparent" : background,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
});
