import { StyleSheet, View } from "react-native";

import { formatCalendarDate, formatMinutes, type CalendarDate } from "@/lib/time";
import { fontSize, fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Text } from "@/ui/text";

import type { ActivityTotals } from "../domain/activity";
import { HISTORY_LABEL, type HeatmapCell } from "../domain/heatmap";

/**
 * Os painéis de texto da tela Progresso.
 *
 * ## A régua de linguagem
 *
 * Nada aqui parabeniza, adverte ou apelida a pessoa. "Você é imparável" e
 * "Você falhou" são o mesmo erro em direções opostas: os dois transformam um
 * registro do que aconteceu em um veredito sobre quem a pessoa é.
 *
 * Também não se diz "2h15 concluídas", que afirmaria tempo trabalhado. O dado
 * é a estimativa das tarefas fechadas, então a frase é "2h15 em tarefas
 * concluídas". A precisão aqui não é preciosismo: é a diferença entre um
 * número em que se pode confiar e um que soa bem.
 */

/* -------------------------------------------------------------------------- */

/**
 * Sequência atual e recorde.
 *
 * A sequência atual é o número maior da tela porque é a única métrica que
 * responde "estou mantendo o ritmo?" — o resto responde "quanto".
 */
export function StreakHeader({
  current,
  best,
  compact,
}: {
  readonly current: number;
  readonly best: number;
  /**
   * Telefone. O recorde desce para uma linha própria em vez de disputar a
   * largura com a sequência: lado a lado em 320 dp, "dias seguidos" quebrava
   * em duas linhas e desalinhava o bloco inteiro.
   */
  readonly compact: boolean;
}) {
  const colors = useThemeColors();

  if (compact) {
    return (
      <View style={styles.streakCompact}>
        <View style={styles.streakMain}>
          <StreakNumber value={current} color={colors.accent} />
          <StreakWords current={current} />
        </View>

        {best === 0 ? null : (
          <View style={[styles.bestRow, { borderColor: colors.border }]}>
            <Text variant="caption" muted>
              Melhor {HISTORY_LABEL}
            </Text>
            <Text variant="label">
              {best} {best === 1 ? "dia" : "dias"}
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.streak}>
      <View style={styles.streakMain}>
        <StreakNumber value={current} color={colors.accent} />
        <StreakWords current={current} />
      </View>

      {best === 0 ? null : (
        <View style={[styles.best, { borderColor: colors.border }]}>
          <Text variant="caption" muted>
            Melhor {HISTORY_LABEL}
          </Text>
          <Text variant="label" style={{ color: colors.text }}>
            {best} {best === 1 ? "dia" : "dias"}
          </Text>
        </View>
      )}
    </View>
  );
}

/** O número é decorativo: quem lê por voz recebe a frase inteira em `StreakWords`. */
function StreakNumber({ value, color }: { readonly value: number; readonly color: string }) {
  return (
    <Text
      allowFontScaling={false}
      style={[styles.streakNumber, { color }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {value}
    </Text>
  );
}

function StreakWords({ current }: { readonly current: number }) {
  return (
    <View style={styles.streakText}>
      <Text variant="label" numberOfLines={1} accessibilityLabel={streakLabel(current)}>
        {current === 1 ? "dia seguido" : "dias seguidos"}
      </Text>
      <Text variant="caption" muted numberOfLines={1}>
        Sequência atual
      </Text>
    </View>
  );
}

function streakLabel(current: number): string {
  if (current === 0) return "Sequência atual: nenhum dia seguido ainda.";
  return `Sequência atual: ${current} ${current === 1 ? "dia seguido" : "dias seguidos"}.`;
}

/* -------------------------------------------------------------------------- */

/**
 * Resumo da semana corrente.
 *
 * Diz "4 dias ativos", nunca "4 de 7". Numa quarta-feira, "4 de 7" contaria
 * quinta, sexta e sábado — dias que ainda não aconteceram — como três falhas.
 */
export function WeekSummary({ totals }: { readonly totals: ActivityTotals }) {
  const colors = useThemeColors();

  const empty = totals.activeDays === 0;

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Text variant="label" muted style={styles.cardHeading}>
        ESTA SEMANA
      </Text>

      {empty ? (
        <Text variant="caption" muted>
          Nada concluído ainda nesta semana.
        </Text>
      ) : (
        <View style={styles.metrics}>
          <Metric value={formatMinutes(totals.minutes)} label="em tarefas concluídas" />
          <Metric
            value={String(totals.tasks)}
            label={totals.tasks === 1 ? "tarefa" : "tarefas"}
          />
          <Metric
            value={String(totals.activeDays)}
            label={totals.activeDays === 1 ? "dia ativo" : "dias ativos"}
          />
        </View>
      )}
    </View>
  );
}

function Metric({ value, label }: { readonly value: string; readonly label: string }) {
  return (
    <View style={styles.metric} accessibilityRole="text" accessibilityLabel={`${value} ${label}`}>
      <Text style={styles.metricValue} allowFontScaling={false}>
        {value}
      </Text>
      <Text variant="caption" muted numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Detalhe do dia selecionado.
 *
 * É um painel FIXO abaixo da grade, e não um balão flutuante. Um balão teria
 * que ser medido e reposicionado para não sair da tela, cairia sob o dedo no
 * telefone justamente onde foi tocado, e exigiria hover para aparecer no
 * desktop — três problemas para exibir duas linhas de texto. Fixo, ele funciona
 * igual nas duas plataformas, nunca é encoberto e é lido em ordem pelo leitor
 * de tela.
 */
export function DayDetail({ cell }: { readonly cell: HeatmapCell | null }) {
  const colors = useThemeColors();

  return (
    <View
      style={[styles.detail, { borderColor: colors.border }]}
      accessibilityLiveRegion="polite"
    >
      {cell === null ? (
        <Text variant="caption" muted>
          Toque em um dia para ver o que foi concluído.
        </Text>
      ) : (
        <>
          <Text variant="label">{capitalizeFirst(longDate(cell.date))}</Text>
          <Text variant="caption" muted>
            {cell.minutes === 0
              ? "Nenhuma tarefa concluída."
              : `${formatMinutes(cell.minutes)} em ${cell.tasks} ${cell.tasks === 1 ? "tarefa concluída" : "tarefas concluídas"}.`}
          </Text>
        </>
      )}
    </View>
  );
}

function longDate(date: CalendarDate): string {
  return formatCalendarDate(date, { weekday: "long", day: "numeric", month: "long" });
}

/** "sábado, 29 de agosto" -> "Sábado, 29 de agosto", sem maiuscular tudo. */
function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  streak: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  streakCompact: { gap: spacing.sm },
  bestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  streakMain: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 1 },
  streakNumber: { fontSize: 52, fontWeight: fontWeight.semibold, lineHeight: 58 },
  streakText: { gap: 1, flexShrink: 1 },
  best: {
    alignItems: "flex-end",
    gap: 1,
    paddingLeft: spacing.md,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },

  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeading: { letterSpacing: 0.5 },
  metrics: { flexDirection: "row", gap: spacing.lg },
  metric: { flex: 1, gap: 1 },
  metricValue: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },

  detail: {
    gap: 2,
    minHeight: 46,
    justifyContent: "center",
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
