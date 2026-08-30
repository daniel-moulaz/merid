import { Tabs } from "expo-router";
import { StyleSheet, View, type ColorValue } from "react-native";

import { control, fontSize, fontWeight, radius } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";

/**
 * Navegação principal.
 *
 * Cinco destinos, nenhum vazio: HOJE é a tela do dia, AGENDA é a semana,
 * INBOX é onde as tarefas nascem, PROGRESSO é o histórico, CONTA guarda sessão
 * e fuso.
 *
 * A ordem é temporal e não alfabética — dia, semana, o que ainda não tem hora,
 * o que já passou, eu — porque é assim que a pessoa navega: do agora para o
 * entorno. Hoje e Agenda ficam adjacentes por serem a MESMA agenda em dois
 * zooms, e Progresso fecha a linha do tempo pelo passado.
 *
 * ## Cinco abas cabem?
 *
 * Cabem, e é a alternativa certa. Em 320 dp cada aba fica com 64 dp — acima do
 * alvo mínimo de toque, e o limite que iOS e Material assumem para uma barra.
 * A saída "esconder Progresso num menu" pouparia largura à custa de tornar
 * invisível metade da proposta do produto: um app sobre ritmo em que o ritmo
 * mora dentro de um menu não é sobre ritmo.
 *
 * O que a quinta aba exigiu foi tipografia: os rótulos passaram a não escalar
 * com a fonte do sistema e a caber em uma linha, porque "Progresso" com fonte
 * ampliada quebrava em duas e desalinhava a barra inteira.
 *
 * O `Tabs` do Expo Router é usado sem biblioteca extra de navegação: o SDK 57
 * já traz o navegador embutido, então nada disso exige development build.
 *
 * ## Por que os ícones são desenhados
 *
 * A primeira versão misturava barras desenhadas com o caractere "◍" — pesos e
 * tamanhos ópticos diferentes, e no Android o glifo tipográfico saiu menor que
 * os demais, porque depende da fonte do sistema.
 *
 * A correção poderia ser `@expo/vector-icons`, mas ele não está no projeto e
 * traz arquivos de fonte na casa dos megabytes para resolver CINCO ícones.
 * Desenhá-los com `View` custa zero byte, renderiza idêntico nas três
 * plataformas e é imune à fonte do sistema. Todos partem da mesma caixa de
 * 24×24 e da mesma espessura de traço (`control.strokeWidth`), que é o que
 * garante a consistência que faltava.
 *
 * As Etapas 3 e 4 acrescentaram um ícone cada, então o custo/benefício não
 * mudou. Se um dia forem muitos, aí sim vale reavaliar uma biblioteca.
 */
export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: {
          fontSize: fontSize.xs,
          fontWeight: fontWeight.medium,
        },
        // Com cinco abas o rótulo mais longo decide a largura de todas. Sem
        // isto, a fonte grande do sistema quebraria "Progresso" em duas linhas
        // e a barra inteira sairia do lugar.
        tabBarAllowFontScaling: false,
      }}
    >
      <Tabs.Screen
        name="hoje"
        options={{
          title: "Hoje",
          tabBarIcon: ({ color, focused }) => <CalendarGlyph color={color} filled={focused} />,
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: "Agenda",
          tabBarIcon: ({ color, focused }) => <WeekGlyph color={color} filled={focused} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, focused }) => <ListGlyph color={color} filled={focused} />,
        }}
      />
      <Tabs.Screen
        name="progresso"
        options={{
          title: "Progresso",
          tabBarIcon: ({ color, focused }) => <PulseGlyph color={color} filled={focused} />,
        }}
      />
      <Tabs.Screen
        name="conta"
        options={{
          title: "Conta",
          tabBarIcon: ({ color, focused }) => <PersonGlyph color={color} filled={focused} />,
        }}
      />
    </Tabs>
  );
}

type GlyphProps = { readonly color: ColorValue; readonly filled: boolean };

/** Calendário: moldura com a faixa de cabeçalho preenchida quando ativo. */
function CalendarGlyph({ color, filled }: GlyphProps) {
  return (
    <Glyph>
      <View style={[styles.frame, { borderColor: color }]}>
        <View style={[styles.calendarHeader, { backgroundColor: color }]} />
        {filled ? (
          <View style={[styles.calendarMark, { backgroundColor: color }]} />
        ) : null}
      </View>
    </Glyph>
  );
}

/**
 * Semana: a mesma moldura do calendário, dividida em colunas.
 *
 * Partilhar a moldura com o ícone de Hoje é intencional: as duas telas SÃO a
 * mesma agenda, e o que muda entre elas é o zoom. Um dia marcado contra vários
 * dias lado a lado diz isso sem legenda.
 */
function WeekGlyph({ color, filled }: GlyphProps) {
  return (
    <Glyph>
      <View style={[styles.frame, { borderColor: color }]}>
        <View style={[styles.calendarHeader, { backgroundColor: color }]} />
        <View style={styles.columns}>
          <View style={[styles.column, { backgroundColor: color, opacity: filled ? 1 : 0.55 }]} />
          <View style={[styles.column, { backgroundColor: color, opacity: filled ? 1 : 0.55 }]} />
          <View style={[styles.column, { backgroundColor: color, opacity: filled ? 1 : 0.55 }]} />
        </View>
      </View>
    </Glyph>
  );
}

/** Lista: três linhas, a última mais curta — silhueta de itens pendentes. */
function ListGlyph({ color, filled }: GlyphProps) {
  return (
    <Glyph>
      <View style={styles.stack}>
        <View style={[styles.line, { backgroundColor: color }]} />
        <View style={[styles.line, { backgroundColor: color }]} />
        <View style={[styles.line, styles.lineShort, { backgroundColor: color, opacity: filled ? 1 : 0.55 }]} />
      </View>
    </Glyph>
  );
}

/**
 * Ritmo: três barras crescentes.
 *
 * Deliberadamente NÃO é um gráfico de pizza nem uma seta para cima. Barras
 * crescentes leem como "acumulando ao longo do tempo", que é o que a tela
 * mostra; uma seta leria como "subindo", prometendo um julgamento de
 * desempenho que o produto não faz.
 */
function PulseGlyph({ color, filled }: GlyphProps) {
  return (
    <Glyph>
      <View style={styles.bars}>
        <View style={[styles.bar, styles.barSm, { backgroundColor: color, opacity: filled ? 1 : 0.55 }]} />
        <View style={[styles.bar, styles.barMd, { backgroundColor: color, opacity: filled ? 1 : 0.75 }]} />
        <View style={[styles.bar, styles.barLg, { backgroundColor: color }]} />
      </View>
    </Glyph>
  );
}

/** Pessoa: cabeça e ombros, preenchidos quando ativo. */
function PersonGlyph({ color, filled }: GlyphProps) {
  return (
    <Glyph>
      <View
        style={[
          styles.head,
          { borderColor: color, backgroundColor: filled ? color : "transparent" },
        ]}
      />
      <View
        style={[
          styles.shoulders,
          { borderColor: color, backgroundColor: filled ? color : "transparent" },
        ]}
      />
    </Glyph>
  );
}

/** Caixa comum: é ela que faz os três ícones terem o mesmo tamanho óptico. */
function Glyph({ children }: { readonly children: React.ReactNode }) {
  return (
    <View style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no">
      {children}
    </View>
  );
}

const SIZE = 24;
const STROKE = control.strokeWidth;

const styles = StyleSheet.create({
  glyph: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },

  frame: {
    width: 20,
    height: 19,
    borderWidth: STROKE,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  calendarHeader: { height: 5, width: "100%" },
  calendarMark: {
    width: 6,
    height: 6,
    borderRadius: 1.5,
    marginTop: 3,
    alignSelf: "center",
  },
  columns: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    paddingTop: 3,
    paddingHorizontal: 2,
  },
  column: { width: STROKE, height: 8, borderRadius: 1 },

  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 18 },
  bar: { width: 4, borderRadius: 1.5 },
  barSm: { height: 8 },
  barMd: { height: 13 },
  barLg: { height: 18 },

  stack: { width: 20, gap: 4 },
  line: { height: STROKE, width: "100%", borderRadius: 1 },
  lineShort: { width: "60%" },

  head: {
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    borderWidth: STROKE,
    marginBottom: 2,
  },
  shoulders: {
    width: 18,
    height: 9,
    borderWidth: STROKE,
    borderTopLeftRadius: radius.pill,
    borderTopRightRadius: radius.pill,
    borderBottomWidth: 0,
  },
});
