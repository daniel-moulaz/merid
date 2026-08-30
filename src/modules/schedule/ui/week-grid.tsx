import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import {
  formatCalendarDate,
  formatMinutes,
  minutesToTimeOfDay,
  timeOfDayInTimeZone,
  timeOfDayToMinutes,
  type CalendarDate,
  type TimeOfDay,
} from "@/lib/time";
import { control, fontSize, radius, spacing, timeline } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

import { packIntoLanes } from "../domain/lane-packing";
import type { ScheduleBlockWithTask } from "../domain/schedule-block";
import {
  buildWeekWindow,
  dayLoadMinutes,
  segmentBlockByDay,
  weekDays,
  weekHourMarks,
} from "../domain/week";
import { WeekBlockCard, WeekOverflowChip, type PositionedSegment } from "./week-block-card";

const WEEK = timeline.week;

/** Granularidade ao tocar um vazio: ninguém planeja para as 14:07. */
const SLOT_STEP_MINUTES = 15;

/**
 * Onde, DENTRO da coluna, o toque caiu — ou `null` quando não houve toque.
 *
 * Cada plataforma nomeia isso de um jeito, e a diferença é real, não cosmética:
 * no nativo o evento vem do responder de toque e traz `locationY`; na web o
 * `onPress` do react-native-web nasce de um `click` do DOM, cujo `nativeEvent`
 * é um `MouseEvent` — ele tem `offsetY` e NÃO tem `locationY`. Ler só
 * `locationY` dava `undefined` na web e um `NaN` silencioso na conta seguinte.
 *
 * E quando a coluna é ativada pelo TECLADO (foco + Enter) não existe posição
 * nenhuma. Daí o `null` explícito em vez de um número inventado.
 *
 * A leitura é feita por chave e validada em tempo de execução porque os tipos
 * do React Native descrevem o evento nativo, não o do DOM: o campo existe na
 * web, mas não no tipo. Nada aqui silencia erro — o valor só é aceito se for
 * mesmo um número finito.
 *
 * `Reflect.get` e não desestruturação: em um `MouseEvent` do DOM, `offsetY` é
 * um getter do PROTÓTIPO, e qualquer cópia por espalhamento o perderia.
 */
function pressOffsetY(event: GestureResponderEvent): number | null {
  for (const key of ["locationY", "offsetY"]) {
    const value: unknown = Reflect.get(event.nativeEvent, key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }

  return null;
}

/**
 * A grade semanal — uma composição só para telefone e desktop.
 *
 * **A decisão de layout.** Sete colunas em 360 dp dariam ~45 px cada: nenhum
 * título caberia. Em vez de criar uma tela mobile separada, a coluna tem
 * largura MÍNIMA (`minColumnWidth`) e a grade rola horizontalmente quando os
 * sete dias não cabem. No desktop os sete entram e a rolagem some; no telefone
 * aparecem ~3 dias legíveis, com encaixe por coluna para nunca parar em cima de
 * um dia pela metade. Um componente, um modelo mental, nenhum arquivo `.web`.
 *
 * **A régua** fica presa à esquerda (não rola na horizontal) e o **cabeçalho
 * dos dias** fica preso no topo (não rola na vertical), sincronizado com o
 * corpo em um sentido só — corpo manda no cabeçalho, nunca o contrário, o que
 * elimina qualquer laço de realimentação entre os dois.
 *
 * Toda a matemática — segmentação por dia, janela, empacotamento em colunas —
 * vem do domínio puro e testado. Aqui só se multiplica minuto por pixel.
 */
export function WeekGrid({
  weekStart,
  today,
  timeZone,
  entries,
  onSelectBlock,
  onSelectSlot,
  onOpenDay,
  isRefreshing = false,
  onRefresh,
}: {
  readonly weekStart: CalendarDate;
  readonly today: CalendarDate;
  readonly timeZone: string;
  readonly entries: readonly ScheduleBlockWithTask[];
  readonly onSelectBlock: (entry: ScheduleBlockWithTask) => void;
  readonly onSelectSlot: (date: CalendarDate, startTime: TimeOfDay | undefined) => void;
  readonly onOpenDay: (date: CalendarDate) => void;
  readonly isRefreshing?: boolean;
  readonly onRefresh?: (() => void) | undefined;
}) {
  const colors = useThemeColors();

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  /** Índice de bloco por id: o segmento carrega só o `blockId`. */
  const blocksById = useMemo(
    () => new Map(entries.map((entry) => [entry.block.id, entry])),
    [entries],
  );

  /**
   * Um bloco que atravessa a meia-noite vira dois segmentos de APRESENTAÇÃO,
   * um em cada dia. A entidade continua sendo uma só.
   */
  const segments = useMemo(
    () =>
      entries.flatMap((entry) =>
        segmentBlockByDay({ ...entry.block, id: entry.block.id }, timeZone),
      ),
    [entries, timeZone],
  );

  const window = useMemo(() => buildWeekWindow(segments), [segments]);
  const marks = useMemo(() => weekHourMarks(window), [window]);

  /** Segmentos empacotados em colunas, por dia. */
  const positionedByDay = useMemo(() => {
    const byDay = new Map<CalendarDate, PositionedSegment[]>();

    for (const date of days) {
      const ofDay = segments.filter((segment) => segment.date === date);

      const packed = packIntoLanes(ofDay)
        .map((segment) => {
          const entry = blocksById.get(segment.blockId);
          return entry === undefined ? null : { ...segment, task: entry.task };
        })
        .filter((segment): segment is PositionedSegment => segment !== null);

      byDay.set(date, packed);
    }

    return byDay;
  }, [days, segments, blocksById]);

  // A largura vem do LAYOUT, não da janela: no desktop a barra lateral de não
  // agendadas já consumiu parte da tela, e `useWindowDimensions` mentiria.
  const [availableWidth, setAvailableWidth] = useState(0);
  const columnWidth = Math.max(
    WEEK.minColumnWidth,
    (availableWidth - WEEK.gutterWidth) / days.length,
  );
  const contentWidth = columnWidth * days.length;
  const contentHeight = window.totalMinutes * WEEK.pixelsPerMinute;

  const headerRef = useRef<ScrollView>(null);
  const verticalRef = useRef<ScrollView>(null);
  const scrolledForWeek = useRef<CalendarDate | null>(null);

  /** Corpo manda no cabeçalho — um sentido só, sem laço. */
  function syncHeader(event: NativeSyntheticEvent<NativeScrollEvent>): void {
    headerRef.current?.scrollTo({ x: event.nativeEvent.contentOffset.x, animated: false });
  }

  /** Mesma regra da tela Hoje: abre perto do agora, ou do primeiro bloco. */
  const initialOffset = useMemo(() => {
    const CONTEXT_MINUTES = 60;
    const isCurrentWeek = days.includes(today);

    const anchor = isCurrentWeek
      ? timeOfDayToMinutes(timeOfDayInTimeZone(new Date(), timeZone))
      : (segments.reduce<number | null>(
          (earliest, segment) =>
            earliest === null ? segment.startMinute : Math.min(earliest, segment.startMinute),
          null,
        ) ?? 8 * 60);

    return Math.max(0, (anchor - CONTEXT_MINUTES - window.startMinute) * WEEK.pixelsPerMinute);
  }, [days, today, timeZone, segments, window.startMinute]);

  useEffect(() => {
    // Uma vez por semana exibida; depois disso a rolagem é do usuário.
    if (scrolledForWeek.current === weekStart || contentHeight === 0) return;
    scrolledForWeek.current = weekStart;
    verticalRef.current?.scrollTo({ y: initialOffset, animated: false });
  }, [weekStart, initialOffset, contentHeight]);

  function handleLayout(event: LayoutChangeEvent): void {
    setAvailableWidth(event.nativeEvent.layout.width);
  }

  /**
   * Converte a posição do toque em um horário utilizável.
   *
   * Sem posição — ativação por teclado — não se inventa um horário: passa
   * `undefined` e o formulário usa o padrão dele (o próximo passo do relógio),
   * que é o comportamento já validado na tela Hoje.
   */
  function slotAt(date: CalendarDate, offsetY: number | null): void {
    if (offsetY === null) {
      onSelectSlot(date, undefined);
      return;
    }

    const rawMinute = window.startMinute + offsetY / WEEK.pixelsPerMinute;
    const snapped = Math.round(rawMinute / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
    const clamped = Math.min(Math.max(snapped, window.startMinute), 24 * 60 - SLOT_STEP_MINUTES);

    onSelectSlot(date, minutesToTimeOfDay(clamped));
  }

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <View style={styles.headerGutter} />
        <ScrollView
          ref={headerRef}
          horizontal
          // Só o corpo é arrastável: o cabeçalho apenas acompanha.
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
        >
          <View style={[styles.headerDays, { width: contentWidth }]}>
            {days.map((date) => (
              <DayHeader
                key={date}
                date={date}
                isToday={date === today}
                width={columnWidth}
                loadMinutes={dayLoadMinutes(segments, date)}
                onPress={() => onOpenDay(date)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView
        ref={verticalRef}
        style={styles.vertical}
        contentContainerStyle={styles.verticalContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh === undefined ? undefined : (
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          )
        }
      >
        <View style={[styles.body, { height: contentHeight }]}>
          <View style={styles.gutter}>
            {marks.map((minute) => (
              <Text
                key={minute}
                variant="caption"
                muted
                numberOfLines={1}
                allowFontScaling={false}
                style={[
                  styles.hourLabel,
                  { top: (minute - window.startMinute) * WEEK.pixelsPerMinute },
                ]}
              >
                {minutesToTimeOfDay(minute % 1440)}
              </Text>
            ))}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            onScroll={syncHeader}
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={columnWidth}
            snapToAlignment="start"
          >
            <View style={{ width: contentWidth, height: contentHeight }}>
              {/* Linhas de hora atrás de tudo, uma vez para as sete colunas. */}
              {marks.map((minute) => (
                <View
                  key={minute}
                  pointerEvents="none"
                  style={[
                    styles.hourLine,
                    {
                      top: (minute - window.startMinute) * WEEK.pixelsPerMinute,
                      backgroundColor: colors.border,
                    },
                  ]}
                />
              ))}

              <View style={styles.columns}>
                {days.map((date) => (
                  <DayColumn
                    key={date}
                    date={date}
                    isToday={date === today}
                    timeZone={timeZone}
                    width={columnWidth}
                    window={window}
                    positioned={positionedByDay.get(date) ?? []}
                    onSelectBlock={(blockId) => {
                      const entry = blocksById.get(blockId);
                      if (entry !== undefined) onSelectBlock(entry);
                    }}
                    onPressEmpty={(offsetY) => slotAt(date, offsetY)}
                    onOpenDay={() => onOpenDay(date)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function DayHeader({
  date,
  isToday,
  width,
  loadMinutes,
  onPress,
}: {
  readonly date: CalendarDate;
  readonly isToday: boolean;
  readonly width: number;
  readonly loadMinutes: number;
  readonly onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isToday }}
      accessibilityLabel={`${formatCalendarDate(date, { weekday: "long", day: "numeric", month: "long" })}${
        loadMinutes === 0 ? ", sem blocos" : `, ${formatMinutes(loadMinutes)} planejados`
      }. Abre o dia.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayHeader,
        { width, backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
      ]}
    >
      <Text variant="caption" muted numberOfLines={1} style={styles.weekday}>
        {formatCalendarDate(date, { weekday: "short" }).replace(".", "")}
      </Text>

      {/* Hoje: número em disco cheio. Um marcador, não uma decoração. */}
      <View
        style={[
          styles.dayNumber,
          isToday && { backgroundColor: colors.accent },
        ]}
      >
        <Text
          variant="label"
          style={{ color: isToday ? colors.textInverted : colors.text }}
        >
          {formatCalendarDate(date, { day: "numeric" })}
        </Text>
      </View>

      <Text variant="caption" muted numberOfLines={1} style={styles.load}>
        {loadMinutes === 0 ? "—" : formatMinutes(loadMinutes)}
      </Text>
    </Pressable>
  );
}

function DayColumn({
  date,
  isToday,
  timeZone,
  width,
  window,
  positioned,
  onSelectBlock,
  onPressEmpty,
  onOpenDay,
}: {
  readonly date: CalendarDate;
  readonly isToday: boolean;
  readonly timeZone: string;
  readonly width: number;
  readonly window: { readonly startMinute: number; readonly endMinute: number };
  readonly positioned: readonly PositionedSegment[];
  readonly onSelectBlock: (blockId: string) => void;
  readonly onPressEmpty: (offsetY: number | null) => void;
  readonly onOpenDay: () => void;
}) {
  const colors = useThemeColors();

  const visible = positioned.filter((segment) => segment.lane < WEEK.maxLanes);
  const hidden = positioned.filter((segment) => segment.lane >= WEEK.maxLanes);

  return (
    <View
      style={[
        styles.column,
        {
          width,
          borderRightColor: colors.border,
          backgroundColor: isToday ? colors.surface : "transparent",
        },
      ]}
    >
      {/* Camada de toque ATRÁS dos blocos: tocar um vazio começa a agendar. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Agendar em ${formatCalendarDate(date, { weekday: "long", day: "numeric", month: "long" })}`}
        accessibilityHint="Escolhe o horário tocado e abre a seleção de tarefa"
        onPress={(event) => onPressEmpty(pressOffsetY(event))}
        style={StyleSheet.absoluteFill}
      />

      {visible.map((segment) => (
        <WeekBlockCard
          key={segment.id}
          positioned={segment}
          windowStartMinute={window.startMinute}
          columnWidth={width}
          onPress={() => onSelectBlock(segment.blockId)}
        />
      ))}

      {hidden.length === 0 ? null : (
        <WeekOverflowChip
          count={hidden.length}
          date={date}
          top={
            (Math.min(...hidden.map((segment) => segment.startMinute)) - window.startMinute) *
            WEEK.pixelsPerMinute
          }
          onPress={onOpenDay}
        />
      )}

      {isToday ? <NowLine window={window} timeZone={timeZone} /> : null}
    </View>
  );
}

const NOW_TICK_MS = 60_000;

/** A linha do agora — só na coluna de hoje, e isolada para o tique do relógio
 *  não redesenhar a grade inteira a cada minuto. */
function NowLine({
  window,
  timeZone,
}: {
  readonly window: { readonly startMinute: number; readonly endMinute: number };
  readonly timeZone: string;
}) {
  const colors = useThemeColors();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const minute = timeOfDayToMinutes(timeOfDayInTimeZone(now, timeZone));
  if (minute < window.startMinute || minute > window.endMinute) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.now,
        {
          top: (minute - window.startMinute) * WEEK.pixelsPerMinute,
          backgroundColor: colors.danger,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerRow: {
    flexDirection: "row",
    height: WEEK.headerHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerGutter: { width: WEEK.gutterWidth },
  headerDays: { flexDirection: "row" },
  dayHeader: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingVertical: spacing.xs,
  },
  weekday: { textTransform: "uppercase", fontSize: 10, letterSpacing: 0.4 },
  dayNumber: {
    minWidth: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  load: { fontSize: 10 },

  vertical: { flex: 1 },
  verticalContent: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  body: { flexDirection: "row" },

  gutter: { width: WEEK.gutterWidth },
  hourLabel: {
    position: "absolute",
    right: spacing.sm,
    fontSize: fontSize.xs,
    fontVariant: ["tabular-nums"],
    // Centra o rótulo na marca.
    transform: [{ translateY: -7 }],
  },
  hourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },

  columns: { flexDirection: "row", flex: 1 },
  column: { height: "100%", borderRightWidth: StyleSheet.hairlineWidth },

  now: { position: "absolute", left: 0, right: 0, height: 1.5 },
});

export const WEEK_MIN_COLUMN_WIDTH = WEEK.minColumnWidth;
export const WEEK_GUTTER_WIDTH = WEEK.gutterWidth;
export const WEEK_TOUCH_TARGET = control.minTouch;
