import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  addMonths,
  formatCalendarDate,
  formatMonth,
  monthWeeks,
  startOfMonth,
  WEEKDAY_LABELS,
  type CalendarDate,
} from "@/lib/time";
import { control, fontSize, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

import { Text } from "./text";

/**
 * Mini calendário — escolher um dia tocando nele.
 *
 * ## Por que ele existe
 *
 * O escape para "outra data" era um campo de texto pedindo `AAAA-MM-DD`. Isso
 * falha de três formas ao mesmo tempo: obriga a digitar num teclado numérico de
 * celular, usa um formato que ninguém escreve no Brasil, e não responde a
 * pergunta que a pessoa realmente tem — "que dia da semana cai isso?". Um
 * calendário responde as três de graça: não se digita, o formato não existe, e
 * a coluna já diz o dia da semana.
 *
 * ## Por que próprio, e não uma biblioteca
 *
 * Mesma razão de `DateField` e `TimeField`: um componente em React Native puro
 * se comporta igual em Android, iOS e Web, funciona no Expo Go sem development
 * build, e não amarra o projeto a uma dependência de calendário. A aritmética
 * já existia e é testada (`@/lib/time/month.ts`) — aqui só se desenha.
 *
 * ## Alvo de toque
 *
 * As células dividem a largura em sete. Num telefone de 320 dp, descontado o
 * recuo do formulário, cada uma fica com cerca de 40 dp — abaixo dos 44 dp de
 * alvo mínimo em largura, e é uma escolha consciente: sete colunas em 320 dp não
 * comportam outra coisa, e é exatamente o que Google Agenda e Todoist fazem. A
 * ALTURA compensa (44 dp), então o alvo real é confortável na direção em que o
 * dedo erra mais.
 */

const MIN_CELL_HEIGHT = control.minTouch;

export function MiniCalendar({
  value,
  today,
  onChange,
  /** Rótulo do grupo para leitores de tela. */
  accessibilityLabel = "Escolher data",
}: {
  /** Dia selecionado, ou `null` quando ainda não há escolha (ex.: sem prazo). */
  readonly value: CalendarDate | null;
  readonly today: CalendarDate;
  readonly onChange: (value: CalendarDate) => void;
  readonly accessibilityLabel?: string;
}) {
  const colors = useThemeColors();

  /**
   * O mês visível é estado próprio: folhear até dezembro para conferir uma data
   * não pode mudar o valor escolhido. Ele começa no mês do valor — ou no de
   * hoje, quando ainda não há valor.
   */
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(value ?? today));

  /**
   * Quando o valor muda por fora (um atalho "Amanhã", por exemplo) e cai em
   * outro mês, a grade acompanha — senão a marca de selecionado desapareceria
   * sem explicação.
   */
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value !== null && startOfMonth(value) !== visibleMonth) {
      setVisibleMonth(startOfMonth(value));
    }
  }

  const currentMonth = startOfMonth(today);
  const weeks = useMemo(() => monthWeeks(visibleMonth), [visibleMonth]);

  return (
    <View
      style={[styles.container, { borderColor: colors.border, backgroundColor: colors.surface }]}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.header}>
        <MonthArrow
          direction="previous"
          label="Mês anterior"
          onPress={() => setVisibleMonth((month) => addMonths(month, -1))}
        />

        {/* O título é um botão de volta.
            Navegar mês a mês é confortável para o caso comum (um prazo daqui a
            algumas semanas) e vira trabalho quando alguém folheia longe e quer
            voltar. Um toque no nome do mês desfaz a viagem inteira — sem
            acrescentar mais nenhum controle à barra. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            visibleMonth === currentMonth
              ? formatMonth(visibleMonth)
              : `${formatMonth(visibleMonth)}. Voltar para o mês atual.`
          }
          disabled={visibleMonth === currentMonth}
          onPress={() => setVisibleMonth(currentMonth)}
          style={styles.monthButton}
        >
          <Text variant="label" numberOfLines={1} style={styles.monthLabel}>
            {formatMonth(visibleMonth)}
          </Text>
        </Pressable>

        <MonthArrow
          direction="next"
          label="Próximo mês"
          onPress={() => setVisibleMonth((month) => addMonths(month, 1))}
        />
      </View>

      <View style={styles.weekdays}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.cell}>
            <Text
              variant="caption"
              muted
              allowFontScaling={false}
              style={styles.weekdayLabel}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week[0]?.date} style={styles.week}>
          {week.map((cell) => (
            <DayCell
              key={cell.date}
              date={cell.date}
              inMonth={cell.inMonth}
              isSelected={cell.date === value}
              isToday={cell.date === today}
              onPress={() => onChange(cell.date)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayCell({
  date,
  inMonth,
  isSelected,
  isToday,
  onPress,
}: {
  readonly date: CalendarDate;
  readonly inMonth: boolean;
  readonly isSelected: boolean;
  readonly isToday: boolean;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  const textColor = isSelected
    ? colors.textInverted
    : isToday
      ? colors.accent
      : inMonth
        ? colors.text
        : colors.textMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={formatCalendarDate(date, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}
      onPress={onPress}
      style={styles.cell}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.day,
            {
              backgroundColor: isSelected
                ? colors.accent
                : pressed
                  ? colors.surfaceRaised
                  : "transparent",
              // Hoje ganha um anel, e não preenchimento: preencher competiria
              // com a marca do dia SELECIONADO, que é a informação que a pessoa
              // veio conferir.
              borderColor: isToday && !isSelected ? colors.accent : "transparent",
            },
          ]}
        >
          <Text
            variant="label"
            allowFontScaling={false}
            style={{
              color: textColor,
              fontWeight: isSelected || isToday ? fontWeight.semibold : fontWeight.regular,
            }}
          >
            {String(Number(date.slice(8, 10)))}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Seta desenhada com borda — o mesmo motivo de `PeriodNav`: glifos variam. */
function MonthArrow({
  direction,
  label,
  onPress,
}: {
  readonly direction: "previous" | "next";
  readonly label: string;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.arrowButton,
        { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
      ]}
    >
      <View
        style={[
          styles.arrow,
          {
            borderColor: colors.text,
            transform: [{ rotate: direction === "previous" ? "-135deg" : "45deg" }],
            marginLeft: direction === "previous" ? 3 : -3,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  monthButton: { flex: 1, minHeight: control.minTouch, justifyContent: "center" },
  monthLabel: { textAlign: "center" },
  arrowButton: {
    width: control.minTouch,
    height: control.minTouch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  arrow: {
    width: 8,
    height: 8,
    borderTopWidth: control.strokeWidth,
    borderRightWidth: control.strokeWidth,
  },

  weekdays: { flexDirection: "row", paddingBottom: spacing.xs },
  weekdayLabel: { fontSize: fontSize.xxs },

  week: { flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", justifyContent: "center" },
  day: {
    width: "100%",
    minHeight: MIN_CELL_HEIGHT,
    maxWidth: MIN_CELL_HEIGHT,
    aspectRatio: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
