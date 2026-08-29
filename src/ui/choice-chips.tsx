import { Pressable, StyleSheet, View } from "react-native";

import { control, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { Text } from "./text";

/**
 * Escolha rápida entre várias opções curtas.
 *
 * **Como o grid se resolve.** Cada chip tem uma largura MÍNIMA (`flexBasis`) e
 * cresce para dividir a sobra (`flexGrow`). O resultado: quantos couberem por
 * linha, sempre com a linha preenchida por inteiro e sem nenhuma porcentagem
 * calibrada para um tamanho de tela — em um telefone estreito saem três por
 * linha; em uma tela larga, todos em uma. A quebra deixa de ser acidental.
 *
 * É diferente do `SegmentedField`, que serve a poucas opções mutuamente
 * exclusivas em uma linha só (prioridade). Aqui as opções são muitas e a
 * quebra é esperada.
 */
export function ChoiceChips<TValue extends string | number>({
  label,
  options,
  value,
  onChange,
  minChipWidth = 88,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: TValue; readonly label: string }[];
  /** `null` quando nenhuma opção corresponde ao valor atual. */
  readonly value: TValue | null;
  readonly onChange: (value: TValue) => void;
  readonly minChipWidth?: number;
}) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.group}
    >
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, checked: isSelected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.chip,
              { flexBasis: minChipWidth },
              {
                backgroundColor: isSelected ? colors.accent : colors.surface,
                borderColor: isSelected ? colors.accent : colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              variant="label"
              numberOfLines={1}
              style={[
                styles.label,
                { color: isSelected ? colors.textInverted : colors.text },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    flexGrow: 1,
    minHeight: control.chipHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontWeight: fontWeight.medium },
});
