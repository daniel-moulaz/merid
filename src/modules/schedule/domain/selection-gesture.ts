import type { CalendarDate } from "@/lib/time";

import {
  buildSelection,
  minuteAtOffset,
  type IntervalSelection,
  type SelectionBounds,
} from "./interval-selection";

/**
 * A máquina de estados do gesto de seleção — pura, sem React e sem evento.
 *
 * Ela existe separada do hook por um motivo prático: o comportamento que
 * realmente pode dar errado num gesto não é a aritmética de minutos, é a
 * SEQUÊNCIA — mover sem ter começado, soltar depois de cancelar, um segundo
 * toque durante o primeiro, o gesto morrendo no meio. Nada disso precisa de
 * uma tela para ser testado, e testar através de uma só esconderia o que
 * falhou.
 *
 * A camada de gesto de cada plataforma traduz seus eventos para estas quatro
 * transições e não precisa saber de mais nada.
 */

export type SelectedInterval = {
  /** Coluna onde o gesto começou. Na tela Hoje há uma só. */
  readonly date: CalendarDate;
  readonly selection: IntervalSelection;
};

export type SelectionGestureState = {
  /** Onde o dedo pousou. `null` quando não há gesto em andamento. */
  readonly anchor: { readonly date: CalendarDate; readonly minute: number } | null;
  /** O que deve ser desenhado agora. `null` quando não há nada a desenhar. */
  readonly current: SelectedInterval | null;
};

/** Como converter uma posição vertical em minuto, na tela que hospeda o gesto. */
export type SelectionGeometry = {
  readonly windowStartMinute: number;
  readonly pixelsPerMinute: number;
  readonly bounds: SelectionBounds;
};

export const IDLE_SELECTION: SelectionGestureState = { anchor: null, current: null };

export function startSelection(
  date: CalendarDate,
  offsetY: number,
  geometry: SelectionGeometry,
): SelectionGestureState {
  const minute = minuteAtOffset(offsetY, geometry.windowStartMinute, geometry.pixelsPerMinute);

  return {
    anchor: { date, minute },
    current: { date, selection: buildSelection(minute, minute, geometry.bounds) },
  };
}

/**
 * Move a ponta livre.
 *
 * Sem âncora não faz nada — um `move` que chega antes do `start`, ou depois de
 * um cancelamento, é um evento atrasado, não uma seleção nova.
 *
 * A DATA vem sempre da âncora. Na semana, arrastar na diagonal ajusta o
 * horário e não troca de coluna: um intervalo que pula de dia no meio do gesto
 * seria impossível de mirar, e atravessar a meia-noite continua sendo trabalho
 * do formulário, onde a data é explícita.
 */
export function moveSelection(
  state: SelectionGestureState,
  offsetY: number,
  geometry: SelectionGeometry,
): SelectionGestureState {
  if (state.anchor === null) return state;

  const minute = minuteAtOffset(offsetY, geometry.windowStartMinute, geometry.pixelsPerMinute);

  return {
    anchor: state.anchor,
    current: {
      date: state.anchor.date,
      selection: buildSelection(state.anchor.minute, minute, geometry.bounds),
    },
  };
}

export function cancelSelection(): SelectionGestureState {
  return IDLE_SELECTION;
}

/**
 * Fim do gesto: devolve o estado zerado e o que deve ser confirmado.
 *
 * Soltar sem ter começado devolve `committed: null`, e não um intervalo
 * inventado — é o que impede que um evento perdido de `pointerup` crie um
 * agendamento que ninguém pediu.
 */
export function finishSelection(state: SelectionGestureState): {
  readonly state: SelectionGestureState;
  readonly committed: SelectedInterval | null;
} {
  return { state: IDLE_SELECTION, committed: state.anchor === null ? null : state.current };
}

/** Duas fotos do gesto descrevem o mesmo desenho? Evita redesenho inútil. */
export function isSameSelectedInterval(
  a: SelectedInterval | null,
  b: SelectedInterval | null,
): boolean {
  if (a === null || b === null) return a === b;

  return (
    a.date === b.date &&
    a.selection.startMinute === b.selection.startMinute &&
    a.selection.endMinute === b.selection.endMinute
  );
}
