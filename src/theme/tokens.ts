/**
 * Tokens de design centralizados.
 *
 * Nenhum componente escreve cor, espaçamento ou tamanho de fonte literal:
 * tudo sai daqui. É o que mantém a consistência sem uma camada de build de
 * estilos.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

/**
 * Altura de controles.
 *
 * Existe porque a mesma medida estava repetida como número solto em botão,
 * campo, chip e item de aba — e foi assim que o seletor de horário acabou
 * espremido no Android. `minTouch` é o piso de alvo de toque das diretrizes de
 * acessibilidade (44 dp); nada clicável fica abaixo disso.
 */
export const control = {
  minTouch: 44,
  /** Controle principal de formulário: campo de horário, botão de ação. */
  height: 52,
  /** Chip compacto: durações, dias, atalhos. */
  chipHeight: 40,
  /** Espessura de traço dos ícones desenhados. */
  strokeWidth: 1.75,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
} as const;

/**
 * A cor da marca entra na Etapa 2 junto com a agenda.
 *
 * A Etapa 1 era neutra em cinza — correto para uma lista, genérico para um
 * produto de time blocking. O bloco de agenda é o objeto protagonista do
 * Dayflow: ele precisa de uma cor própria, que se distinga do texto e do
 * fundo sem gritar. Os tons `brand*` existem para isso; os neutros continuam
 * exatamente como estavam.
 */
const lightColors = {
  background: "#ffffff",
  surface: "#fafafa",
  surfaceRaised: "#f4f4f5",
  border: "#e4e4e7",
  borderStrong: "#d4d4d8",
  text: "#18181b",
  textMuted: "#71717a",
  textInverted: "#ffffff",
  accent: "#4f46e5",
  /** Fundo de um bloco de agenda. */
  brandSoft: "#eef2ff",
  brandBorder: "#c7d2fe",
  brandText: "#3730a3",
  /** Véu atrás de folhas de ação. Escuro nos dois temas, de propósito. */
  scrim: "rgba(9, 9, 11, 0.45)",
  danger: "#dc2626",
  success: "#16a34a",
  warning: "#d97706",
} as const;

/** As chaves vêm do tema claro; os valores são cores livres. */
export type ThemeColors = Record<keyof typeof lightColors, string>;

const darkColors: ThemeColors = {
  background: "#09090b",
  surface: "#111113",
  surfaceRaised: "#1c1c1f",
  border: "#27272a",
  borderStrong: "#3f3f46",
  text: "#fafafa",
  textMuted: "#a1a1aa",
  textInverted: "#0b0a1f",
  accent: "#818cf8",
  brandSoft: "#1e1b4b",
  brandBorder: "#4338ca",
  brandText: "#c7d2fe",
  scrim: "rgba(0, 0, 0, 0.65)",
  danger: "#f87171",
  success: "#4ade80",
  warning: "#fbbf24",
};

export const themes = { light: lightColors, dark: darkColors } as const;

/**
 * Medidas das duas timelines.
 *
 * `pixelsPerMinute` é o que torna a duração LEGÍVEL: um bloco de 30 min tem
 * metade da altura de um de 1 h, sempre.
 *
 * As densidades são DIFERENTES de propósito. O dia tem uma coluna larga e pode
 * ser generoso; a semana precisa caber sete colunas e ainda mostrar uma faixa
 * de horas útil sem virar uma rolagem infinita. Forçar a mesma densidade
 * prejudicaria uma das duas.
 */
export const timeline = {
  day: {
    pixelsPerMinute: 1.5,
    minBlockHeight: 34,
    /** A partir desta altura o card mostra também o intervalo e a duração. */
    rangeVisibleHeight: 42,
    /** Largura da régua de horários à esquerda. */
    gutterWidth: 52,
    /** Respiro entre blocos que dividem a mesma faixa de horário. */
    laneGap: 4,
  },
  week: {
    // 1 px/min = 60 px por hora: 17 h úteis cabem em ~1020 px de rolagem.
    pixelsPerMinute: 1,
    minBlockHeight: 20,
    /** Coluna estreita: o horário só aparece quando há altura de sobra. */
    rangeVisibleHeight: 46,
    gutterWidth: 44,
    laneGap: 2,
    /**
     * Largura mínima de uma coluna de dia.
     *
     * É ela que decide a experiência: no desktop os sete dias cabem e a grade
     * é estática; abaixo disso a grade rola horizontalmente mostrando ~3 dias
     * LEGÍVEIS, em vez de sete colunas ilegíveis.
     */
    minColumnWidth: 96,
    headerHeight: 60,
    /** Acima deste número de colunas simultâneas, o excedente vira "+N". */
    maxLanes: 3,
  },
} as const;

/**
 * Cor do marcador de prioridade. Só URGENT e HIGH ganham cor: se tudo
 * chamasse atenção, nada chamaria.
 */
export function priorityColor(
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  colors: ThemeColors,
): string {
  switch (priority) {
    case "URGENT":
      return colors.danger;
    case "HIGH":
      return colors.warning;
    case "MEDIUM":
      return colors.borderStrong;
    case "LOW":
      return colors.border;
  }
}
