import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import {
  minutesToTimeOfDay,
  toCalendarDateInTimeZone,
  type CalendarDate,
  type TimeOfDay,
} from "@/lib/time";
import { fontSize, radius, spacing, timeline as timelineTokens } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

import type { ScheduleBlockWithTask } from "../domain/schedule-block";
import {
  buildTimelineWindow,
  dayBlockContinuity,
  hourMarks,
  layoutBlocks,
  minuteOffsetInWindow,
  type TimelineWindow,
} from "../domain/timeline";
import { canDragToMove } from "../domain/move-block";
import {
  SCHEDULE_SNAP_MINUTES,
  snapMinute,
  type IntervalSelection,
} from "../domain/interval-selection";
import { IntervalSelectionSurface } from "./interval-selection-surface";
import { useBlockMove } from "./use-block-move";
import { pressOffsetY } from "./press-position";
import { ScheduleBlockCard } from "./schedule-block-card";
import { SelectionPreview } from "./selection-preview";
import { useIntervalSelection } from "./use-interval-selection";

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

const MINUTES_IN_DAY = 1440;

/** O que a timeline recebe: o bloco identificado pelo id do próprio bloco. */
type TimelineEntry = ScheduleBlockWithTask & { readonly id: string };

export function DayTimeline({
  date,
  today,
  timeZone,
  entries,
  onSelectBlock,
  onSelectSlot,
  onSelectRange,
  onMoveBlock,
  isLoaded = true,
  isRefreshing = false,
  onRefresh,
}: {
  readonly date: CalendarDate;
  readonly today: CalendarDate;
  readonly timeZone: string;
  readonly entries: readonly ScheduleBlockWithTask[];
  readonly onSelectBlock: (entry: ScheduleBlockWithTask) => void;
  /** Toque em um horário vazio: caminho rápido, a duração vem da tarefa. */
  readonly onSelectSlot: (date: CalendarDate, startTime: TimeOfDay) => void;
  /** Fim de um arrasto: início e fim escolhidos explicitamente. */
  readonly onSelectRange: (date: CalendarDate, start: TimeOfDay, end: TimeOfDay) => void;
  /** Fim de um arrasto de bloco: novo horário, mesma duração. */
  readonly onMoveBlock: (
    entry: ScheduleBlockWithTask,
    date: CalendarDate,
    start: TimeOfDay,
    end: TimeOfDay,
  ) => void;
  /**
   * Os blocos do dia já chegaram?
   *
   * A âncora inicial depende deles: em um dia que não é hoje ela é o primeiro
   * bloco. Ancorar antes da resposta deixava a pessoa parada às 08:00 olhando
   * para o vazio, com o dia inteiro planejado logo abaixo da dobra.
   */
  readonly isLoaded?: boolean;
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

  /**
   * Seleção por arrasto — a mesma geometria que desenha a grade.
   *
   * `window.startMinute` e `endMinute` são offsets desde o início do dia nesta
   * tela (ver `timeline.ts`), e não minutos de relógio; a diferença não importa
   * aqui, porque o domínio da seleção só trabalha com a régua que recebe.
   */
  const selectionGeometry = useMemo(
    () => ({
      windowStartMinute: window.startMinute,
      pixelsPerMinute: timelineTokens.day.pixelsPerMinute,
      bounds: { minMinute: window.startMinute, maxMinute: window.endMinute },
    }),
    [window.startMinute, window.endMinute],
  );

  const commitRange = useCallback(
    (day: CalendarDate, selection: IntervalSelection) => {
      onSelectRange(
        day,
        minutesToTimeOfDay(selection.startMinute % MINUTES_IN_DAY),
        minutesToTimeOfDay(selection.endMinute % MINUTES_IN_DAY),
      );
    },
    [onSelectRange],
  );

  const { selection, onStart, onMove, onFinish, cancel } = useIntervalSelection({
    geometry: selectionGeometry,
    onCommit: commitRange,
  });

  const blocksById = useMemo(
    () => new Map(identified.map((entry) => [entry.block.id, entry])),
    [identified],
  );

  const commitMove = useCallback(
    (blockId: string, startMinute: number, endMinute: number) => {
      const entry = blocksById.get(blockId);
      if (entry === undefined) return;

      onMoveBlock(
        entry,
        date,
        minutesToTimeOfDay(startMinute % MINUTES_IN_DAY),
        minutesToTimeOfDay(endMinute % MINUTES_IN_DAY),
      );
    },
    [blocksById, date, onMoveBlock],
  );

  const move = useBlockMove({
    geometry: {
      pixelsPerMinute: timelineTokens.day.pixelsPerMinute,
      bounds: { minMinute: window.startMinute, maxMinute: window.endMinute },
    },
    onCommit: commitMove,
  });

  /** Recusa o gesto quando ele nasce sobre um bloco já agendado. */
  const beginSelection = useCallback(
    (_x: number, y: number): boolean => {
      const minute = window.startMinute + y / timelineTokens.day.pixelsPerMinute;
      const occupied = positioned.some(
        (item) => minute >= item.startMinute && minute < item.endMinute,
      );
      if (occupied) return false;

      onStart(date, y);
      return true;
    },
    [date, onStart, positioned, window.startMinute],
  );

  /** Toque simples: só o início; a duração continua vindo da tarefa. */
  const tapSlot = useCallback(
    (y: number | null) => {
      // Sem posição (ativação por teclado): abre no início da janela visível,
      // que é o horário que a pessoa está de fato olhando.
      const raw =
        y === null ? window.startMinute : window.startMinute + y / timelineTokens.day.pixelsPerMinute;
      const clamped = Math.min(
        Math.max(snapMinute(raw), window.startMinute),
        MINUTES_IN_DAY - SCHEDULE_SNAP_MINUTES,
      );
      onSelectSlot(date, minutesToTimeOfDay(clamped % MINUTES_IN_DAY));
    },
    [date, onSelectSlot, window.startMinute],
  );

  const scrollRef = useRef<ScrollView>(null);
  /**
   * O ajuste vale uma vez por dia exibido — e uma vez mais quando os blocos
   * daquele dia chegam, porque só então a âncora é a definitiva. Depois disso a
   * rolagem é do usuário.
   *
   * Um efeito, e não `onContentSizeChange`: quando os blocos cabem na janela
   * padrão a altura do conteúdo não muda, então aquele callback nem dispararia.
   * É o mesmo mecanismo da grade semanal.
   */
  const scrolledFor = useRef<string | null>(null);
  const scrollKey = `${date}|${isLoaded ? "ready" : "pending"}`;

  useEffect(() => {
    if (scrolledFor.current === scrollKey || height === 0) return;
    scrolledFor.current = scrollKey;
    scrollRef.current?.scrollTo({ y: initialOffset, animated: false });
  }, [scrollKey, initialOffset, height]);

  return (
    <ScrollView
      ref={scrollRef}
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
            <View key={mark.minute} style={[styles.hourRow, { top }]}>
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
          <IntervalSelectionSurface
            onStart={beginSelection}
            onMove={(_x, y) => onMove(y)}
            onFinish={onFinish}
            onCancel={cancel}
          >
            {/* Camada de toque ATRÁS de tudo: o caminho rápido continua sendo
                um toque, e é ele que mantém a criação acessível sem gesto. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agendar uma tarefa neste dia"
              accessibilityHint="Escolhe o horário tocado e abre a seleção de tarefa"
              // Enquanto um intervalo está sendo desenhado, o toque simples sai
              // de cena: soltar o dedo ao fim de uma seleção não pode também
              // contar como um toque e abrir um segundo agendamento.
              disabled={selection !== null}
              onPress={(event) => tapSlot(pressOffsetY(event))}
              style={StyleSheet.absoluteFill}
            />

            {selection === null ? null : (
              <SelectionPreview
                selection={selection.selection}
                windowStartMinute={window.startMinute}
                pixelsPerMinute={timelineTokens.day.pixelsPerMinute}
              />
            )}

            {positioned.map((item) => (
              <ScheduleBlockCard
                key={item.item.id}
                positioned={item}
                timeZone={timeZone}
                windowStartMinute={window.startMinute}
                onPress={() => onSelectBlock(item.item)}
                // Um bloco recortado pela meia-noite não é arrastável: o que
                // está desenhado é um PEDAÇO, e gravar o pedaço apagaria o
                // resto do bloco. Mesma regra da grade semanal.
                moveGesture={
                  canDragToMove(dayBlockContinuity(item.item.block, window))
                    ? move.gestureFor(
                        item.item.block.id,
                        { startMinute: item.startMinute, endMinute: item.endMinute },
                        true,
                      )
                    : undefined
                }
                movedTo={move.offsetFor(item.item.block.id)}
              />
            ))}
          </IntervalSelectionSurface>
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
    pointerEvents: "none",
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
    pointerEvents: "none",
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
