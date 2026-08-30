import {
  MIN_SELECTION_MINUTES,
  snapMinute,
  type IntervalSelection,
  type SelectionBounds,
} from "./interval-selection";

/**
 * Mover um bloco já agendado — puro, sem pixel e sem React.
 *
 * ## O que mover significa
 *
 * Mover muda QUANDO, nunca O QUÊ nem QUANTO. A duração é preservada como
 * invariante: arrastar um bloco de 1h30 para outro horário produz um bloco de
 * 1h30, e a estimativa da tarefa não é tocada. Encolher tempo reservado é a
 * operação de redimensionar, que é outra coisa e tem outro gesto.
 *
 * ## O que acontece nas bordas
 *
 * Empurrar o bloco para além do fim da janela poderia, em tese, encurtá-lo — e
 * seria a pior resposta possível: a pessoa pediu para MOVER e receberia um
 * bloco menor sem ter pedido. Em vez disso o bloco PARA na borda, mantendo a
 * duração. É o mesmo comportamento de arrastar um objeto contra a parede.
 */

/** Um bloco em minutos, do jeito que a grade o desenha. */
export type MovableInterval = {
  readonly startMinute: number;
  readonly endMinute: number;
};

/**
 * Onde o bloco fica depois de arrastá-lo por `deltaMinutes`.
 *
 * O delta é aplicado ao INÍCIO e o snap também — assim o bloco encaixa na
 * grade pelo topo, que é a borda que a pessoa está olhando enquanto arrasta. O
 * fim acompanha, preservando a duração exata, mesmo que ela não seja múltipla
 * do passo (um bloco de 50 min continua com 50 min).
 */
export function moveInterval(
  original: MovableInterval,
  deltaMinutes: number,
  bounds: SelectionBounds,
): IntervalSelection {
  const duration = original.endMinute - original.startMinute;

  // Uma janela que não comporta o bloco não deveria existir; se existir, o
  // bloco ocupa tudo o que há, em vez de devolver um intervalo invertido.
  if (bounds.maxMinute - bounds.minMinute <= duration) {
    return { startMinute: bounds.minMinute, endMinute: bounds.maxMinute };
  }

  const desiredStart = snapMinute(original.startMinute + deltaMinutes);
  const startMinute = Math.min(
    Math.max(desiredStart, bounds.minMinute),
    bounds.maxMinute - duration,
  );

  return { startMinute, endMinute: startMinute + duration };
}

/** O bloco mudou de lugar? Um arrasto que volta ao ponto de partida não é edição. */
export function hasMoved(original: MovableInterval, moved: IntervalSelection): boolean {
  return original.startMinute !== moved.startMinute;
}

/**
 * Um bloco pode ser arrastado?
 *
 * Blocos que atravessam a meia-noite aparecem como DOIS segmentos, e arrastar
 * um segmento seria arrastar meia entidade. Preferimos desabilitar o gesto a
 * inventar uma semântica: reagendar pelo formulário continua disponível e
 * mostra as duas datas explicitamente.
 *
 * Blocos de tarefas concluídas continuam móveis: o registro do planejamento é
 * legítimo, e corrigir o horário depois de concluir é comum.
 */
export function canDragToMove(segment: {
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}): boolean {
  return !segment.continuesBefore && !segment.continuesAfter;
}

/** Duração mínima que um bloco pode ter — compartilhada com a seleção. */
export const MIN_BLOCK_MINUTES = MIN_SELECTION_MINUTES;
