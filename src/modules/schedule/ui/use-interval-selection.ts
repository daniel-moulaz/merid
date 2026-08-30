import { useCallback, useRef, useState } from "react";

import type { CalendarDate } from "@/lib/time";

import {
  cancelSelection,
  finishSelection,
  IDLE_SELECTION,
  isSameSelectedInterval,
  moveSelection,
  startSelection,
  type SelectedInterval,
  type SelectionGeometry,
  type SelectionGestureState,
} from "../domain/selection-gesture";

/**
 * Liga a máquina de seleção ao React.
 *
 * Fino de propósito: as regras estão em `selection-gesture.ts`, que é puro e
 * testado. Aqui só resolvem-se duas coisas de runtime — quando redesenhar, e
 * como não confirmar um intervalo defasado.
 *
 * A camada de gesto de cada plataforma chama `onStart`, `onMove`, `onFinish` e
 * `cancel`; nada além disso atravessa esta fronteira.
 */
export function useIntervalSelection({
  geometry,
  onCommit,
}: {
  readonly geometry: SelectionGeometry;
  /** Chamado ao soltar. É o único ponto em que a seleção sai da tela. */
  readonly onCommit: (date: CalendarDate, selection: SelectedInterval["selection"]) => void;
}) {
  /**
   * O estado autoritativo mora no ref; o `useState` é só o espelho que a tela
   * observa.
   *
   * Um arrasto emite dezenas de eventos por segundo, e como tudo encaixa em
   * passos de 15 minutos a maioria descreve o MESMO intervalo do evento
   * anterior. Guardando a verdade no ref e publicando apenas quando o desenho
   * muda, o gesto inteiro custa um punhado de renderizações em vez de uma por
   * quadro — sem `useMemo` espalhado nem componente memoizado.
   */
  const stateRef = useRef<SelectionGestureState>(IDLE_SELECTION);
  const [visible, setVisible] = useState<SelectedInterval | null>(null);

  const apply = useCallback((next: SelectionGestureState) => {
    const previous = stateRef.current;
    stateRef.current = next;

    if (isSameSelectedInterval(previous.current, next.current)) return;
    setVisible(next.current);
  }, []);

  const onStart = useCallback(
    (date: CalendarDate, offsetY: number) => {
      apply(startSelection(date, offsetY, geometry));
    },
    [apply, geometry],
  );

  const onMove = useCallback(
    (offsetY: number) => {
      apply(moveSelection(stateRef.current, offsetY, geometry));
    },
    [apply, geometry],
  );

  /**
   * Confirma lendo o REF, não o estado.
   *
   * O último movimento pode não ter sido renderizado quando o dedo levanta;
   * confirmar a partir do espelho criaria um bloco diferente do que a pessoa
   * acabou de ver.
   */
  const onFinish = useCallback(() => {
    const { state, committed } = finishSelection(stateRef.current);
    apply(state);

    if (committed !== null) onCommit(committed.date, committed.selection);
  }, [apply, onCommit]);

  const cancel = useCallback(() => {
    apply(cancelSelection());
  }, [apply]);

  return { selection: visible, onStart, onMove, onFinish, cancel };
}
