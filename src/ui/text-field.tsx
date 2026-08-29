import { useId } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { fontSize, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { Text } from "./text";

export type TextFieldProps = Omit<TextInputProps, "style"> & {
  readonly label: string;
  /** Esconde o rótulo visualmente, mantendo-o para leitores de tela. */
  readonly hideLabel?: boolean;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
};

export function TextField({
  label,
  hideLabel = false,
  error,
  hint,
  ...rest
}: TextFieldProps) {
  const colors = useThemeColors();
  const errorId = useId();
  const hasError = error !== undefined && error !== "";

  return (
    <View style={styles.container}>
      {hideLabel ? null : (
        <Text variant="label" muted style={styles.label}>
          {label}
        </Text>
      )}

      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-invalid={hasError}
        aria-errormessage={hasError ? errorId : undefined}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.background,
            borderColor: hasError ? colors.danger : colors.border,
          },
        ]}
        {...rest}
      />

      {hasError ? (
        <Text nativeID={errorId} variant="caption" tone="danger" style={styles.message}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { marginBottom: 2 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
  },
  message: { marginTop: 2 },
});
