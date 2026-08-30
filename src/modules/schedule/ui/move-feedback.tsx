import { Pressable, StyleSheet, View } from "react-native";

import { control, elevation, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

/**
 * A confirmação de que o bloco mudou de horário, com desfazer.
 *
 * Aparece rente à borda inferior da agenda, sobre a grade, e some ao ser
 * tocada. Não é um modal: interromper a pessoa para dizer que a ação deu certo
 * seria pior que não avisar nada. Ela é um aviso que se pode ignorar — e é
 * justamente por isso que precisa dizer PARA ONDE o bloco foi: quem não viu o
 * arrasto acontecer só descobre pelo texto.
 */
export function MoveFeedback({
  label,
  error,
  onUndo,
  onDismiss,
}: {
  /** "Estudar AEDS · 16:00 → 17:30", ou `null` quando não há nada a anunciar. */
  readonly label: string | null;
  readonly error: string | null;
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
}) {
  const colors = useThemeColors();

  if (label === null && error === null) return null;

  const isError = error !== null;

  return (
    <View style={styles.wrapper}>
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.bar,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: isError ? colors.danger : colors.border,
          },
        ]}
      >
        <Text
          variant="caption"
          numberOfLines={2}
          style={styles.label}
          tone={isError ? "danger" : undefined}
        >
          {isError ? error : label}
        </Text>

        {isError ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar aviso"
            onPress={onDismiss}
            hitSlop={8}
            style={styles.action}
          >
            <Text variant="caption" style={[styles.actionLabel, { color: colors.textMuted }]}>
              Fechar
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Desfazer a mudança de horário"
            onPress={onUndo}
            hitSlop={8}
            style={styles.action}
          >
            <Text variant="caption" style={[styles.actionLabel, { color: colors.accent }]}>
              Desfazer
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // A barra flutua sobre a grade: só ela recebe toque, o resto passa direto.
    pointerEvents: "box-none",
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    maxWidth: 460,
    width: "100%",
    minHeight: control.minTouch,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    ...elevation.floating,
  },
  label: { flex: 1 },
  action: {
    minHeight: control.minTouch,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontWeight: fontWeight.semibold },
});
