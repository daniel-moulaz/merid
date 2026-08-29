import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { addMinutesToTimeOfDay, isTimeOfDay, type TimeOfDay } from "@/lib/time";
import { control, fontSize, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { Text } from "./text";

/**
 * Seleção de HORÁRIO.
 *
 * Sem picker nativo, pelo mesmo motivo do `DateField`: comportamento idêntico
 * nos três alvos, funciona no Expo Go sem development build, e no navegador é
 * um campo de texto de verdade — teclado e leitor de tela funcionam sem
 * gambiarra.
 *
 * **Layout.** O controle ocupa a LARGURA INTEIRA e é um bloco único: passo,
 * horário e passo dentro da mesma moldura, separados por divisores.
 *
 * A primeira versão colocava Início e Fim lado a lado, cada um com três caixas
 * independentes. Em um telefone de 360 dp isso deixava cerca de 30 px para o
 * horário — praticamente um dígito. O erro não foi de medida, foi estrutural:
 * dois controles compostos disputando a mesma linha. Aqui o horário é o único
 * elemento flexível e os passos têm largura fixa, então não existe largura
 * mágica para calibrar: o campo cresce com a tela.
 */

export const TIME_STEP_MINUTES = 15;

export function TimeField({
  label,
  value,
  onChange,
  error,
  hint,
  step = TIME_STEP_MINUTES,
}: {
  readonly label: string;
  readonly value: TimeOfDay;
  readonly onChange: (value: TimeOfDay) => void;
  readonly error?: string | undefined;
  /** Valor à direita do rótulo — usado para a duração ao lado de "Fim". */
  readonly hint?: string | undefined;
  readonly step?: number;
}) {
  const colors = useThemeColors();
  const hasError = error !== undefined && error !== "";

  // Rascunho local para o usuário poder digitar "1", "14", "14:" sem que cada
  // tecla vire (ou rejeite) um horário. Só valores válidos sobem.
  const [draft, setDraft] = useState(value);

  // Quando o valor muda por fora (botões de passo, ou o fim recalculado ao
  // mover o início), o rascunho acompanha. Ajuste durante a renderização, e
  // não em efeito: o React descarta o render em andamento e refaz na hora, sem
  // o quadro intermediário com o texto velho que um `useEffect` produziria.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text variant="label" muted>
          {label}
        </Text>
        {hint === undefined ? null : (
          <Text variant="label" style={{ color: colors.brandText }}>
            {hint}
          </Text>
        )}
      </View>

      <View
        style={[
          styles.frame,
          {
            borderColor: hasError ? colors.danger : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <StepButton
          sign="minus"
          accessibilityLabel={`Diminuir ${label} em ${step} minutos`}
          onPress={() => onChange(addMinutesToTimeOfDay(value, -step))}
        />

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <TextInput
          accessibilityLabel={label}
          accessibilityHint={`Horário no formato hora e minuto. Use os botões para ajustar de ${step} em ${step} minutos.`}
          aria-invalid={hasError}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            if (isTimeOfDay(text)) onChange(text);
          }}
          // Rascunho inválido não fica na tela: ao sair, volta ao último válido.
          onBlur={() => setDraft(value)}
          placeholder="HH:MM"
          placeholderTextColor={colors.textMuted}
          inputMode="numeric"
          autoCorrect={false}
          maxLength={5}
          selectTextOnFocus
          style={[styles.input, { color: colors.text }]}
        />

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <StepButton
          sign="plus"
          accessibilityLabel={`Aumentar ${label} em ${step} minutos`}
          onPress={() => onChange(addMinutesToTimeOfDay(value, step))}
        />
      </View>

      {hasError ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Passo de 15 minutos.
 *
 * O sinal é DESENHADO, não escrito: "−" e "+" tipográficos têm larguras e
 * alturas diferentes entre fontes de sistema, e no Android os dois botões
 * ficavam com pesos visuais distintos. Duas barras têm o mesmo peso sempre.
 */
function StepButton({
  sign,
  accessibilityLabel,
  onPress,
}: {
  readonly sign: "minus" | "plus";
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
      ]}
    >
      <View style={[styles.signBar, { backgroundColor: colors.text }]} />
      {sign === "plus" ? (
        <View
          style={[styles.signBar, styles.signBarVertical, { backgroundColor: colors.text }]}
        />
      ) : null}
    </Pressable>
  );
}

const SIGN_SIZE = 14;
const STEP_WIDTH = 64;

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  labelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },

  frame: {
    flexDirection: "row",
    alignItems: "stretch",
    height: control.height,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  divider: { width: StyleSheet.hairlineWidth },

  step: {
    width: STEP_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  signBar: {
    position: "absolute",
    width: SIGN_SIZE,
    height: 2,
    borderRadius: 1,
  },
  signBarVertical: { transform: [{ rotate: "90deg" }] },

  input: {
    flex: 1,
    height: "100%",
    textAlign: "center",
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    // O Android adiciona recuo interno próprio em TextInput; zerar mantém o
    // texto opticamente centrado na moldura.
    paddingVertical: 0,
    paddingHorizontal: spacing.xs,
  },
});
