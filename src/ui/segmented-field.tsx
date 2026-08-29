import { Pressable, StyleSheet, View } from "react-native";

import { radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { Text } from "./text";

/**
 * Seleção entre poucas opções.
 *
 * Um controle segmentado em vez de um Picker nativo: comportamento idêntico em
 * Android, iOS e Web, e escolher exige um toque só — o formulário precisa ser
 * rápido.
 */
export function SegmentedField<TValue extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: TValue; readonly label: string }[];
  readonly value: TValue;
  readonly onChange: (value: TValue) => void;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.container}>
      <Text variant="label" muted>
        {label}
      </Text>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={[styles.group, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        {options.map((option) => {
          const isSelected = option.value === value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.option,
                isSelected && { backgroundColor: colors.background, borderColor: colors.borderStrong },
              ]}
            >
              <Text variant="caption" muted={!isSelected}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  group: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 2,
    gap: 2,
  },
  option: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
});
