import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  addDaysToCalendarDate,
  daysBetweenCalendarDates,
  formatCalendarDate,
  formatCalendarDateBR,
  type CalendarDate,
} from "@/lib/time";
import { control, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { MiniCalendar } from "./mini-calendar";
import { Text } from "./text";

/**
 * Seleção de DIA.
 *
 * Sem picker nativo de propósito. Um componente próprio em React Native puro
 * se comporta igual em Android (inclusive no Expo Go, sem development build),
 * iOS e Web, é navegável por teclado no navegador e não adiciona dependência
 * que amarre a evolução do projeto.
 *
 * **Por que a faixa sangra até as bordas.** Quatorze dias não cabem em um
 * telefone; a rolagem horizontal é inevitável. O que estava errado antes era o
 * enquadramento: a faixa terminava junto com o recuo do formulário, então o
 * último item aparecia cortado *dentro* de uma margem — lido como defeito. Com
 * a faixa atravessando de borda a borda, o item parcial encosta na borda física
 * da tela, que é a convenção universal de "há mais para o lado". O corte deixa
 * de ser acidente e vira affordance.
 *
 * O dia selecionado é trazido para a vista sozinho — ao editar um bloco da
 * semana que vem, ele não fica escondido fora do quadro.
 */

const STRIP_DAYS = 14;

/** Largura do chip e do intervalo entre eles: uma fonte só para a rolagem. */
const CHIP_WIDTH = 58;
const CHIP_GAP = spacing.xs;
const CHIP_STRIDE = CHIP_WIDTH + CHIP_GAP;

export function DateField({
  label,
  value,
  today,
  onChange,
  error,
  /** Recuo do container em volta — a faixa o cancela para chegar às bordas. */
  edgeInset = spacing.lg,
}: {
  readonly label: string;
  readonly value: CalendarDate;
  readonly today: CalendarDate;
  readonly onChange: (value: CalendarDate) => void;
  readonly error?: string | undefined;
  readonly edgeInset?: number;
}) {
  const colors = useThemeColors();

  const days = useMemo(
    () => Array.from({ length: STRIP_DAYS }, (_, index) => addDaysToCalendarDate(today, index)),
    [today],
  );

  const scrollRef = useRef<ScrollView>(null);
  const shownDate = useRef<CalendarDate | null>(null);

  /** Data fora da faixa (passado, ou além de duas semanas) exige o calendário. */
  const offsetFromToday = daysBetweenCalendarDates(today, value);
  const isOutsideStrip = offsetFromToday < 0 || offsetFromToday >= STRIP_DAYS;
  const [showsCalendar, setShowsCalendar] = useState(isOutsideStrip);

  function revealSelected(): void {
    if (shownDate.current === value || isOutsideStrip) return;
    shownDate.current = value;
    // Uma posição antes do selecionado: mostra que existe dia anterior.
    const x = Math.max(0, (offsetFromToday - 1) * CHIP_STRIDE);
    scrollRef.current?.scrollTo({ x, animated: false });
  }

  return (
    <View style={styles.container}>
      <Text variant="label" muted>
        {label}
      </Text>

      <ScrollView
        ref={scrollRef}
        onContentSizeChange={revealSelected}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CHIP_STRIDE}
        snapToAlignment="start"
        style={{ marginHorizontal: -edgeInset }}
        contentContainerStyle={[styles.strip, { paddingHorizontal: edgeInset }]}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
      >
        {days.map((day, index) => (
          <DayChip
            key={day}
            day={day}
            index={index}
            isSelected={day === value}
            onPress={() => onChange(day)}
          />
        ))}
      </ScrollView>

      <View style={styles.summaryRow}>
        <Text variant="caption" muted style={styles.summary}>
          {capitalizeFirst(
            formatCalendarDate(value, { weekday: "long", day: "numeric", month: "long" }),
          )}
          {" · "}
          {formatCalendarDateBR(value)}
        </Text>

        {/* Escape para datas fora da faixa. Recolhido por padrão: é o caminho
            raro, e aberto o tempo todo pesava a tela. Quando a data JÁ está
            fora da faixa o calendário nasce aberto, porque ali ele não é
            escape — é o único controle que alcança o valor atual. */}
        {isOutsideStrip ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showsCalendar }}
            accessibilityLabel="Escolher outra data no calendário"
            onPress={() => setShowsCalendar((shown) => !shown)}
            hitSlop={spacing.sm}
          >
            <Text variant="caption" style={{ color: colors.accent }}>
              {showsCalendar ? "Fechar" : "Outra data"}
            </Text>
          </Pressable>
        )}
      </View>

      {showsCalendar || isOutsideStrip ? (
        <MiniCalendar
          value={value}
          today={today}
          onChange={onChange}
          accessibilityLabel={label}
        />
      ) : null}

      {error === undefined || error === "" ? null : (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      )}
    </View>
  );
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Rótulo curto: "Hoje", "Amanhã" e depois o dia da semana. */
function dayLabel(index: number, day: CalendarDate): string {
  if (index === 0) return "Hoje";
  if (index === 1) return "Amanhã";
  return formatCalendarDate(day, { weekday: "short" }).replace(".", "");
}

function DayChip({
  day,
  index,
  isSelected,
  onPress,
}: {
  readonly day: CalendarDate;
  readonly index: number;
  readonly isSelected: boolean;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, checked: isSelected }}
      accessibilityLabel={formatCalendarDate(day, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: isSelected ? colors.accent : colors.surface,
          borderColor: isSelected ? colors.accent : colors.border,
          opacity: pressed && !isSelected ? 0.7 : 1,
        },
      ]}
    >
      <Text
        variant="caption"
        numberOfLines={1}
        style={[styles.chipTop, { color: isSelected ? colors.textInverted : colors.textMuted }]}
      >
        {dayLabel(index, day)}
      </Text>
      <Text
        variant="label"
        style={{ color: isSelected ? colors.textInverted : colors.text }}
      >
        {formatCalendarDate(day, { day: "2-digit" })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  strip: { gap: CHIP_GAP, paddingVertical: 2 },
  chip: {
    width: CHIP_WIDTH,
    minHeight: control.height,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  chipTop: { textTransform: "capitalize", fontWeight: fontWeight.medium },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: 24,
  },
  summary: { flexShrink: 1 },
});
