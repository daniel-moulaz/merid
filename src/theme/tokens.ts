import { Platform } from "react-native";

/**
 * Tokens de design centralizados.
 *
 * Nenhum componente escreve cor, espaçamento ou tamanho de fonte literal:
 * tudo sai daqui. É o que mantém a consistência sem uma camada de build de
 * estilos.
 */

export const spacing = {
  /** Só para separar duas linhas de texto de um mesmo bloco. */
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  /** Marcadores pequenos: pontos de prioridade, células do heatmap. */
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  /** Folhas e cartões grandes. */
  xl: 20,
  pill: 999,
} as const;

export const fontSize = {
  /**
   * Rótulos de grade — dia da semana na coluna estreita, carga do dia,
   * eixos do heatmap. Existia como o número solto `10` em cinco arquivos.
   */
  xxs: 10,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  /**
   * Título de tela.
   *
   * Era 28, que é tamanho de página web: no telefone competia com o próprio
   * conteúdo e empurrava a agenda para baixo da dobra. 24 mantém a hierarquia
   * e devolve uma linha de grade — a mesma proporção que o Google Agenda usa
   * no cabeçalho do mês.
   */
  xl: 24,
} as const;

/**
 * Altura de linha, em pixels absolutos.
 *
 * O React Native não aceita multiplicador, e o padrão do sistema é apertado
 * demais para texto de leitura — era isso que dava a sensação de "cru" em
 * blocos de duas linhas. Cada valor é o tamanho da fonte correspondente com a
 * folga certa para o seu papel: títulos justos, corpo generoso.
 */
export const lineHeight = {
  xxs: 13,
  xs: 16,
  sm: 20,
  md: 24,
  lg: 26,
  xl: 30,
} as const;

/**
 * Elevação.
 *
 * Usada com parcimônia e só onde há de fato uma camada flutuando sobre outra:
 * a folha de ações e a barra de desfazer. O resto do produto se separa por
 * borda e por fundo, que é o que funciona igual nos dois temas — no escuro uma
 * sombra preta sobre fundo preto não comunica nada.
 *
 * ## Por que `Platform.select`
 *
 * As duas plataformas divergiram: o react-native-web já considera as props
 * `shadow*` obsoletas e avisa no console a cada render, enquanto no nativo elas
 * continuam sendo a API corrente (e o Android precisa de `elevation`, que não
 * tem equivalente em CSS). Escrever `boxShadow` na web e `shadow*` no nativo é
 * o que mantém o console limpo dos dois lados sem abrir mão da sombra.
 */
export const elevation = {
  sheet: Platform.select({
    web: { boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.18)" },
    default: {
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -4 },
      elevation: 16,
    },
  }),
  floating: Platform.select({
    web: { boxShadow: "0 4px 12px rgba(0, 0, 0, 0.14)" },
    default: {
      shadowColor: "#000",
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
  }),
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
 * Merid: ele precisa de uma cor própria, que se distinga do texto e do
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

  /**
   * Fundo do dia de hoje na grade.
   *
   * Antes o dia corrente usava `surface`, a mesma cor de qualquer cartão — no
   * meio de sete colunas ele simplesmente não se destacava. Um tom da própria
   * marca resolve: diz "é aqui" sem precisar de borda nem de rótulo.
   */
  todayTint: "#f5f3ff",

  /**
   * Fundos suaves para os estados que a lista precisa nomear (atrasada,
   * concluída). Só o par fundo+texto do mesmo matiz; nenhum componente compõe
   * transparência por conta própria.
   */
  dangerSoft: "#fef2f2",
  successSoft: "#f0fdf4",
  warningSoft: "#fffbeb",

  /**
   * Escala de intensidade do heatmap, do vazio ao dia cheio.
   *
   * Uma família tonal só — a mesma do `accent` — e não um arco-íris: a cor
   * codifica QUANTIDADE, e quantidade é uma dimensão ordenada. Matizes
   * diferentes sugeririam categorias diferentes, que não é o caso.
   *
   * Nada de vermelho em lugar nenhum. Um dia sem conclusão não é um erro, é
   * um dia sem conclusão; pintá-lo de alerta transformaria o mapa em cobrança.
   * O nível 0 é apenas um pouco mais escuro que o fundo — presente para
   * desenhar a grade, discreto para não competir com os dias que têm algo.
   */
  activity0: "#f1f1f4",
  activity1: "#c7d2fe",
  activity2: "#a5b4fc",
  activity3: "#7c73ec",
  activity4: "#4f46e5",
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

  todayTint: "#17162b",
  dangerSoft: "#2a1416",
  successSoft: "#0f2318",
  warningSoft: "#2a2110",

  // No escuro a escala sobe do fundo para a luz, e o topo para em `#818cf8`:
  // um índigo mais saturado que isso vira néon sobre preto e cansa a vista
  // numa grade de centenas de células.
  activity0: "#1c1c1f",
  activity1: "#312e81",
  activity2: "#4338ca",
  activity3: "#5b55d6",
  activity4: "#818cf8",
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

/**
 * Cor de uma célula do heatmap. Mantida junto das outras cores derivadas para
 * que nenhum componente precise conhecer a escala.
 */
export function activityColor(level: 0 | 1 | 2 | 3 | 4, colors: ThemeColors): string {
  switch (level) {
    case 0:
      return colors.activity0;
    case 1:
      return colors.activity1;
    case 2:
      return colors.activity2;
    case 3:
      return colors.activity3;
    case 4:
      return colors.activity4;
  }
}

/**
 * Medidas do heatmap.
 *
 * As duas orientações existem porque sete colunas e cinquenta linhas são
 * formatos opostos: no telefone a grade cresce para BAIXO (7 colunas de dias,
 * uma linha por semana) e rola junto com a página; no desktop ela cresce para
 * o LADO, como um calendário anual. Ver `heatmap.tsx`.
 */
export const heatmap = {
  /** Telefone: célula grande o bastante para ser um alvo de toque real. */
  stacked: { cell: 34, gap: 4, minCell: 26 },
  /** Desktop: célula pequena, muitas semanas visíveis. */
  wide: { cell: 13, gap: 3 },
  radius: 3,
} as const;
