import { useCallback, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";

import type { SelectionBounds } from "../domain/interval-selection";
import { hasMoved, moveInterval, type MovableInterval } from "../domain/move-block";
import { MOUSE_DRAG_SLOP, SELECTION_HOLD_MS, SELECTION_SLOP } from "./gesture-tuning";

/**
 * Arrastar um bloco já agendado para outro horário.
 *
 * ## O mesmo contrato de gesto da criação — inclusive a divisão por apontador
 *
 * No **toque**, arrastar significa rolar, então mover exige toque longo e as
 * folgas de `gesture-tuning.ts`: movimento antes da ativação pertence à
 * rolagem, e um gesto que começou rolando não vira arrasto no meio.
 *
 * No **mouse** essa regra seria um defeito — arrastar com o botão pressionado
 * não compete com nada, e exigir meio segundo parado antes de mover faria o
 * bloco parecer travado. Ali o arrasto começa após alguns pixels, como em
 * qualquer calendário de desktop.
 *
 * Em ambos os casos quem decide é o reconhecedor nativo, na UI thread; ver a
 * nota longa de `interval-selection-surface.tsx`.
 *
 * Um toque CURTO no bloco continua abrindo as ações: o `Pressable` do cartão
 * responde por ele, e o Pan só assume depois de ativar.
 *
 * ## Nada é gravado durante o arrasto
 *
 * O deslocamento vive em estado de tela e o cartão se desenha na posição nova.
 * A gravação acontece uma vez, ao soltar, e só quando o bloco realmente mudou
 * de horário — um arrasto que volta ao ponto de partida não escreve nada.
 */
export function useBlockMove({
  geometry,
  onCommit,
}: {
  readonly geometry: {
    readonly pixelsPerMinute: number;
    readonly bounds: SelectionBounds;
  };
  /** Chamado ao soltar, só quando houve mudança real de horário. */
  readonly onCommit: (blockId: string, startMinute: number, endMinute: number) => void;
}) {
  const [moving, setMoving] = useState<{
    readonly blockId: string;
    readonly startMinute: number;
    readonly endMinute: number;
  } | null>(null);

  // A verdade do gesto vive fora do estado: o `setState` do último quadro pode
  // não ter sido aplicado quando o dedo levanta, e gravar a partir da tela
  // salvaria um horário diferente do que a pessoa viu.
  const latest = useRef<{ blockId: string; startMinute: number; endMinute: number } | null>(
    null,
  );

  const publish = useCallback(
    (next: { blockId: string; startMinute: number; endMinute: number } | null) => {
      latest.current = next;
      setMoving((current) => {
        if (current === null && next === null) return current;
        if (
          current !== null &&
          next !== null &&
          current.blockId === next.blockId &&
          current.startMinute === next.startMinute
        ) {
          return current;
        }
        return next;
      });
    },
    [],
  );

  /**
   * Constrói o gesto de um bloco.
   *
   * Fica fora de `useMemo` porque cada cartão precisa do seu, com o intervalo
   * original capturado — e porque o custo de montar um objeto de configuração
   * é irrelevante perto de redesenhar a grade.
   */
  const gestureFor = useCallback(
    (blockId: string, original: MovableInterval, enabled: boolean) => {
      const gesture = Gesture.Pan().enabled(enabled).runOnJS(true);

      if (Platform.OS === "web") {
        gesture.minDistance(MOUSE_DRAG_SLOP);
      } else {
        gesture
          .activateAfterLongPress(SELECTION_HOLD_MS)
          .failOffsetX([-SELECTION_SLOP, SELECTION_SLOP])
          .failOffsetY([-SELECTION_SLOP, SELECTION_SLOP]);
      }

      return gesture
        .onUpdate((event) => {
          const delta = event.translationY / geometry.pixelsPerMinute;
          const next = moveInterval(original, delta, geometry.bounds);
          publish({ blockId, ...next });
        })
        .onEnd((_event, success) => {
          const finished = latest.current;
          if (!success || finished === null || finished.blockId !== blockId) return;

          if (hasMoved(original, finished)) {
            onCommit(blockId, finished.startMinute, finished.endMinute);
          }
        })
        .onFinalize(() => publish(null));
    },
    [geometry.bounds, geometry.pixelsPerMinute, onCommit, publish],
  );

  /** Deslocamento a aplicar ao desenhar este bloco, se ele está sendo movido. */
  const offsetFor = useMemo(
    () => (blockId: string) => (moving?.blockId === blockId ? moving : null),
    [moving],
  );

  return { movingBlockId: moving?.blockId ?? null, gestureFor, offsetFor };
}
