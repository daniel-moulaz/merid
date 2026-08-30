/**
 * Seleção de um intervalo arrastando na agenda — puro, sem pixel e sem React.
 *
 * As duas telas medem o tempo de formas diferentes (a de Hoje por minutos
 * decorridos, a da semana pelo relógio local — ver `week.ts`), mas as duas
 * posicionam com a mesma conta: `topo = (minuto - início da janela) × escala`.
 * Só essa conta e as regras de seleção moram aqui; nada neste arquivo sabe em
 * qual das duas telas está, nem o que é um dia ou um fuso.
 *
 * Nenhuma função aqui cria, valida ou persiste ScheduleBlock: a seleção é uma
 * intenção de interface que vira, no fim do gesto, os mesmos parâmetros que o
 * toque simples já produzia.
 */

/**
 * Granularidade do agendamento, em minutos.
 *
 * Está aqui, e em um lugar só, porque um dia vira preferência do usuário: a
 * pessoa que trabalha em blocos de 30 min não quer a régua de 15. Quando isso
 * acontecer, é este valor que passa a vir do perfil, e nenhuma tela precisa
 * ser reescrita.
 */
export const SCHEDULE_SNAP_MINUTES = 15;

/**
 * Menor intervalo que um gesto pode produzir.
 *
 * Igual a um passo do snap, e não menos: um toque com micro-arrasto viraria um
 * bloco de dois minutos que ninguém quis criar. Igual, e não mais, porque
 * quinze minutos é um compromisso real de agenda — impor meia hora seria a
 * ferramenta discordando de quem a usa.
 */
export const MIN_SELECTION_MINUTES = SCHEDULE_SNAP_MINUTES;

/** Limites em que a seleção pode viver — normalmente a janela visível. */
export type SelectionBounds = {
  readonly minMinute: number;
  /** Exclusivo: a seleção pode terminar aqui, mas não começar. */
  readonly maxMinute: number;
};

export type IntervalSelection = {
  readonly startMinute: number;
  readonly endMinute: number;
};

/**
 * Arredonda para o passo mais PRÓXIMO.
 *
 * A alternativa considerada era piso no início e teto no fim, que faz a
 * seleção sempre "cobrir" o que o dedo percorreu. Ela é boa para marcar texto
 * e ruim para marcar tempo: mirar as 14:15 e receber 14:00 porque o toque caiu
 * um pixel acima parece defeito. Proximidade erra por no máximo metade de um
 * passo, e erra para o lado que a pessoa estava mirando.
 */
export function snapMinute(minute: number, step: number = SCHEDULE_SNAP_MINUTES): number {
  return Math.round(minute / step) * step;
}

/** Minuto sob uma posição vertical, dentro de uma janela desenhada. */
export function minuteAtOffset(
  offsetY: number,
  windowStartMinute: number,
  pixelsPerMinute: number,
): number {
  return windowStartMinute + offsetY / pixelsPerMinute;
}

/** O inverso — onde desenhar um minuto. Mantém preview e grade em fase. */
export function offsetOfMinute(
  minute: number,
  windowStartMinute: number,
  pixelsPerMinute: number,
): number {
  return (minute - windowStartMinute) * pixelsPerMinute;
}

function clamp(value: number, bounds: SelectionBounds): number {
  return Math.min(Math.max(value, bounds.minMinute), bounds.maxMinute);
}

/**
 * O intervalo que o gesto está descrevendo.
 *
 * ## A âncora não se move
 *
 * `anchorMinute` é onde o gesto começou e `currentMinute` é onde o dedo está
 * agora. Arrastar para cima é tão válido quanto para baixo — quem mira o fim
 * de uma reunião e sobe até o começo dela quis exatamente o mesmo intervalo —
 * então a direção só decide qual PONTA se move, nunca o resultado.
 *
 * A âncora ficar imóvel é o que torna o gesto previsível: a borda onde a
 * pessoa apoiou o dedo é a única coisa da tela que ela tem certeza de ter
 * escolhido, e vê-la escorregar durante o arrasto destruiria essa certeza.
 * É também por isso que a duração mínima é aplicada do lado do MOVIMENTO.
 *
 * Nos limites da janela a âncora cede, porque a alternativa seria devolver um
 * intervalo fora da área desenhada.
 */
export function buildSelection(
  anchorMinute: number,
  currentMinute: number,
  bounds: SelectionBounds,
): IntervalSelection {
  const span = bounds.maxMinute - bounds.minMinute;

  // Janela menor que o mínimo não deveria existir; se existir, ela inteira é
  // a única resposta honesta possível.
  if (span <= MIN_SELECTION_MINUTES) {
    return { startMinute: bounds.minMinute, endMinute: bounds.maxMinute };
  }

  const anchor = clamp(snapMinute(anchorMinute), bounds);
  const current = clamp(snapMinute(currentMinute), bounds);

  if (current >= anchor) {
    const endMinute = Math.min(
      bounds.maxMinute,
      Math.max(current, anchor + MIN_SELECTION_MINUTES),
    );
    // Encostou no fim da janela: o começo recua para preservar o mínimo.
    const startMinute = Math.min(anchor, endMinute - MIN_SELECTION_MINUTES);
    return { startMinute, endMinute };
  }

  const startMinute = Math.max(
    bounds.minMinute,
    Math.min(current, anchor - MIN_SELECTION_MINUTES),
  );
  const endMinute = Math.max(anchor, startMinute + MIN_SELECTION_MINUTES);
  return { startMinute, endMinute };
}

/** Duração em minutos. Sempre positiva — `buildSelection` já normalizou. */
export function selectionDuration(selection: IntervalSelection): number {
  return selection.endMinute - selection.startMinute;
}

/** Duas seleções são a mesma? Usado para não redesenhar a cada pixel. */
export function isSameSelection(
  a: IntervalSelection | null,
  b: IntervalSelection | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.startMinute === b.startMinute && a.endMinute === b.endMinute;
}
