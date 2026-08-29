import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

/** Largura confortável para leitura de uma coluna de texto/lista. */
const READING_MAX_WIDTH = 640;

/**
 * Contêiner de tela: respeita notch/barra de status no nativo e limita a
 * largura na web para a leitura não ficar esticada em telas grandes.
 *
 * `maxWidth` existe porque a agenda quebra essa regra de propósito: em
 * desktop ela usa duas colunas (não agendadas | timeline) e precisa de espaço,
 * enquanto uma lista continua melhor estreita.
 */
export function Screen({
  children,
  edges = ["top", "bottom"],
  maxWidth = READING_MAX_WIDTH,
  padded = true,
}: {
  readonly children: ReactNode;
  readonly edges?: readonly Edge[];
  readonly maxWidth?: number;
  /** Desligue quando o conteúdo controlar o próprio recuo (listas roláveis). */
  readonly padded?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.content,
          { maxWidth },
          padded && { paddingHorizontal: spacing.lg },
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
});
