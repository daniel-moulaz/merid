import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { toCalendarDateInTimeZone, type CalendarDate } from "@/lib/time";
import { fontSize, radius, spacing, timeline as timelineTokens } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

import type { ScheduleBlockWithTask } from "../domain/schedule-block";
import {
  buildTimelineWindow,
  hourMarks,
  layoutBlocks,
  minuteOffsetInWindow,
  type TimelineWindow,
} from "../domain/timeline";
import { ScheduleBlockCard } from "./schedule-block-card";

/**
 * A timeline vertical do dia — a tela principal do produto.
 *
 * Toda a matemática (janela, posições, colunas de blocos sobrepostos) vem do
 * domínio, que é puro e testado. Aqui só se multiplica minuto por pixel.
 *
 * Rolagem apenas VERTICAL: no celular a régua fica fixa à esquerda e os blocos
 * ocupam o resto da largura, então nunca há barra horizontal.
 */

/** Âncora de rolagem para um dia sem blocos: começo do horário comercial. */
const DEFAULT_ANCHOR_MINUTE = 8 * 60;

/** O que a timeline recebe: o bloco identificado pelo id do próprio bloco. */
type TimelineEntry = ScheduleBlockWithTask & { readonly id: string };

export function DayTimeline({
  date,
  today,
  timeZone,
  entries,
  onSelectBlock,
  isRefreshing = false,
  onRefresh,
}: {
  readonly date: CalendarDate;
  readonly today: CalendarDate;
  readonly timeZone: string;
  readonly entries: readonly ScheduleBlockWithTask[];
  readonly onSelectBlock: (entry: ScheduleBlockWithTask) => void;
  readonly isRefreshing?: boolean;
  readonly onRefresh?: (() => void) | undefined;
}) {
  const colors = useThemeColors();

  // O id do BLOCO identifica a entrada: a mesma tarefa pode ter vários blocos
  // no mesmo dia, e cada um é um item distinto na agenda.
  const identified = useMemo<TimelineEntry[]>(
    () => entries.map((entry) => ({ ...entry, id: entry.block.id })),
    [entries],
  );

  const intervals = useMemo(
    () => identified.map((entry) => ({ ...entry.block, id: entry.block.id })),
    [identified],
  );

  const window = useMemo(
    () => buildTimelineWindow(date, timeZone, intervals),
    [date, timeZone, intervals],
  );

  const marks = useMemo(() => hourMarks(window, timeZone), [window, timeZone]);

  const positioned = useMemo(
    () =>
      layoutBlocks(
        identified.map((entry) => ({
          ...entry,
          startsAt: entry.block.startsAt,
          endsAt: entry.block.endsAt,
        })),
        window,
      ),
    [identified, window],
  );

  const height = window.totalMinutes * timelineTokens.day.pixelsPerMinute;

  /**
   * Onde a timeline deve abrir.
   *
   * Abrir sempre às 06:00 obrigaria a rolar até achar o que foi planejado — em
   * uma tela chamada "Hoje" isso é o oposto do útil. A prioridade é o AGORA
   * (no dia corrente), depois o primeiro bloco; sem nenhum dos dois, o começo
   * do horário comercial. Sempre com uma folga acima, para dar contexto.
   */
  const initialOffset = useMemo(() => {
    const CONTEXT_MINUTES = 60;

    const anchor =
      date === today
        ? minuteOffsetInWindow(new Date(), window)
        : (positioned[0]?.startMinute ?? DEFAULT_ANCHOR_MINUTE);

    const minutesFromTop = anchor - CONTEXT_MINUTES - window.startMinute;
    return Math.max(0, minutesFromTop * timelineTokens.day.pixelsPerMinute);
  }, [date, today, window, positioned]);

  const scrollRef = useRef<ScrollView>(null);
  // O ajuste vale uma vez por dia exibido: depois disso a rolagem é do usuário.
  const scrolledForDate = useRef<CalendarDate | null>(null);

  return (
    <ScrollView
      ref={scrollRef}
      onContentSizeChange={() => {
        if (scrolledForDate.current === date) return;
        scrolledForDate.current = date;
        scrollRef.current?.scrollTo({ y: initialOffset, animated: false });
      }}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh === undefined ? undefined : (
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        )
      }
    >
      <View style={[styles.canvas, { height }]}>
        {/* Régua: uma linha por hora cheia. */}
        {marks.map((mark) => {
          const top = (mark.minute - window.startMinute) * timelineTokens.day.pixelsPerMinute;

          return (
            <View key={mark.minute} style={[styles.hourRow, { top }]} pointerEvents="none">
              <Text
                variant="caption"
                muted
                numberOfLines={1}
                allowFontScaling={false}
                style={styles.hourLabel}
              >
                {mark.label}
              </Text>
              <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
            </View>
          );
        })}

        {date === today ? <NowIndicator window={window} timeZone={timeZone} /> : null}

        {/* Faixa dos blocos, à direita da régua. */}
        <View style={styles.lanes}>
          {positioned.map((item) => (
            <ScheduleBlockCard
              key={item.item.id}
              positioned={item}
              timeZone={timeZone}
              windowStartMinute={window.startMinute}
              onPress={() => onSelectBlock(item.item)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

/** Atualiza a cada minuto. */
const NOW_TICK_MS = 60_000;

/**
 * A linha do "agora".
 *
 * Isolada em seu próprio componente de propósito: ela é a única coisa da tela
 * que muda sozinha, e assim o tique do relógio não redesenha a timeline
 * inteira a cada minuto.
 */
function NowIndicator({
  window,
  timeZone,
}: {
  readonly window: TimelineWindow;
  readonly timeZone: string;
}) {
  const colors = useThemeColors();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Se o dia virou enquanto a tela estava aberta, a linha não pertence mais a
  // este dia.
  const currentDate = toCalendarDateInTimeZone(now, timeZone);
  const windowDate = toCalendarDateInTimeZone(window.dayStartsAt, timeZone);
  if (currentDate !== windowDate) return null;

  const minute = minuteOffsetInWindow(now, window);
  if (minute < window.startMinute || minute > window.endMinute) return null;

  const top = (minute - window.startMinute) * timelineTokens.day.pixelsPerMinute;

  return (
    <View
      style={[styles.now, { top }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
      <View style={[styles.nowLine, { backgroundColor: colors.danger }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  // O rótulo da hora é centrado na sua marca, então metade dele fica acima
  // do primeiro traço: sem esta folga ele apareceria cortado.
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  canvas: { position: "relative", width: "100%" },

  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // Meia altura da linha do rótulo, para o texto ficar centrado na marca.
    transform: [{ translateY: -7 }],
  },
  // `allowFontScaling={false}` só na RÉGUA: as marcas de hora são posicionadas
  // em pixels absolutos, e uma fonte de sistema muito grande faria o rótulo
  // cobrir a marca seguinte. O conteúdo dos blocos continua escalando.
  hourLabel: {
    width: timelineTokens.day.gutterWidth - spacing.sm,
    textAlign: "right",
    fontSize: fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth },

  lanes: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: timelineTokens.day.gutterWidth,
    right: 0,
  },

  now: {
    position: "absolute",
    left: timelineTokens.day.gutterWidth - 4,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    transform: [{ translateY: -3 }],
  },
  nowDot: { width: 7, height: 7, borderRadius: radius.pill },
  nowLine: { flex: 1, height: 1.5 },
});
