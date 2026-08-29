import { StyleSheet, View } from "react-native";

import { control } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

/**
 * Seta de expandir/recolher.
 *
 * Desenhada com bordas em vez de um caractere como "▾": glifos tipográficos
 * mudam de tamanho e de alinhamento vertical conforme a fonte do sistema, e no
 * Android isso apareceu como um triângulo desalinhado. Duas bordas rotacionadas
 * têm exatamente o mesmo peso dos ícones das abas.
 */
export function Chevron({
  direction,
  muted = true,
}: {
  readonly direction: "up" | "down";
  readonly muted?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View style={styles.box} accessibilityElementsHidden importantForAccessibility="no">
      <View
        style={[
          styles.mark,
          {
            borderColor: muted ? colors.textMuted : colors.text,
            transform: [{ rotate: direction === "up" ? "-45deg" : "135deg" }],
            marginTop: direction === "up" ? 2 : -2,
          },
        ]}
      />
    </View>
  );
}

const SIZE = 8;

const styles = StyleSheet.create({
  box: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  mark: {
    width: SIZE,
    height: SIZE,
    borderTopWidth: control.strokeWidth,
    borderRightWidth: control.strokeWidth,
  },
});
