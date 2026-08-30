import type { ReactNode } from "react";
import { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { MOUSE_DRAG_SLOP, SELECTION_HOLD_MS, SELECTION_SLOP } from "./gesture-tuning";

/**
 * A superfície que traduz gestos em seleção de intervalo.
 *
 * ## Uma mecânica por dispositivo
 *
 * No **mouse**, arrastar não significa rolar — a roda faz isso. O arrasto pode
 * começar assim que o ponteiro anda o bastante para não ser um clique.
 *
 * No **toque**, arrastar significa ROLAR. É o gesto mais frequente da agenda, e
 * roubá-lo transforma cada tentativa de navegar em um agendamento acidental.
 * A regra de produto é: **movimento cedo é rolagem, e continua sendo até o fim
 * do gesto**; só um dedo que ficou parado pelo tempo do toque longo seleciona.
 *
 * ## Quem aplica essa regra: o próprio RNGH
 *
 * Esta regra NÃO é implementada aqui. Ela é a combinação de três parâmetros
 * declarativos, avaliados pelo reconhecedor nativo na UI thread:
 *
 *   `activateAfterLongPress` — antes disso o gesto não pode ativar.
 *   `failOffsetX` / `failOffsetY` — andar além da folga ANTES de ativar
 *      FALHA o reconhecedor, e um reconhecedor que falhou não volta.
 *
 * As duas plataformas chegam lá por caminhos diferentes, e as duas precisam do
 * `failOffset`:
 *
 *   No **Android**, `PanGestureHandler.shouldFail()` já cancela o timer do
 *   toque longo quando o dedo passa do `scaledTouchSlop` do sistema. O
 *   `failOffset` explícito reforça isso com um valor que não depende do
 *   aparelho.
 *
 *   No **iOS**, `RNBetterPanGestureRecognizer` só avalia falha por movimento
 *   quando existe critério customizado — sem `failOffset`, o timer dispararia e
 *   ativaria a seleção mesmo com o dedo em movimento. Ali o parâmetro não é
 *   reforço, é a regra inteira.
 *
 * ## Por que NÃO há `manualActivation` aqui
 *
 * Uma versão anterior arbitrava o gesto em JavaScript e chamava
 * `manager.activate()` / `manager.fail()`. Isso não funciona junto com
 * `runOnJS(true)`: o `GestureStateManager` do RNGH é um worklet (cada método
 * carrega a diretiva `'worklet'` e chama `setGestureState` do Reanimated), e
 * `runOnJS(true)` faz os callbacks rodarem na thread de JS. O resultado era o
 * aviso "You can not use setGestureState in non-worklet function" a cada
 * evento, e — pior — a ativação simplesmente não acontecia, porque a chamada
 * não surtia efeito e `manualActivation` havia desligado a ativação automática.
 *
 * Manter aquela arquitetura exigiria escrever os callbacks como worklets e
 * voltar para o JS com `runOnJS` a cada quadro, trocando uma regra de três
 * parâmetros por uma ponte entre threads. A configuração declarativa expressa a
 * mesma intenção, roda onde os eventos acontecem e não tem corrida possível.
 *
 * **Nenhuma dependência foi adicionada** — a biblioteca já vinha com o Expo
 * Router e funciona no Expo Go.
 *
 * ## Este componente não guarda estado
 *
 * Ele traduz eventos em transições. Quem sabe se existe um gesto em andamento é
 * a máquina de `selection-gesture.ts`, e ela já ignora um `move` ou um `finish`
 * que chegue sem âncora.
 *
 * ## Recusar o gesto no começo
 *
 * `onStart` devolve um booleano. Quem hospeda a superfície sabe onde estão os
 * blocos já agendados e responde `false` quando o toque cai sobre um deles.
 */

type SelectionHandlers = {
  readonly onStart: (x: number, y: number) => boolean;
  readonly onMove: (x: number, y: number) => void;
  readonly onFinish: () => void;
  readonly onCancel: () => void;
};

/** Um construtor por tipo de apontador; ver a nota do módulo. */
function buildMouseGesture(handlers: SelectionHandlers, enabled: boolean) {
  return Gesture.Pan()
    .enabled(enabled)
    .runOnJS(true)
    .minDistance(MOUSE_DRAG_SLOP)
    .onStart((event) => {
      // O gesto só ativa depois de alguns pixels, então `x`/`y` já não são o
      // ponto onde o botão foi pressionado. A translação devolve a origem.
      const accepted = handlers.onStart(
        event.x - event.translationX,
        event.y - event.translationY,
      );
      if (!accepted) handlers.onCancel();
    })
    .onUpdate((event) => handlers.onMove(event.x, event.y))
    .onEnd((_event, success) => {
      if (success) handlers.onFinish();
    })
    .onFinalize((_event, success) => {
      if (!success) handlers.onCancel();
    });
}

function buildTouchGesture(handlers: SelectionHandlers, enabled: boolean) {
  return (
    Gesture.Pan()
      .enabled(enabled)
      // Os callbacks precisam tocar estado do React, então rodam na thread de
      // JS. É seguro justamente porque nada aqui manipula o estado do gesto —
      // quem decide ativar ou falhar é o reconhecedor nativo, na UI thread.
      .runOnJS(true)
      // As três linhas abaixo SÃO a regra de produto. Ver a nota do módulo.
      .activateAfterLongPress(SELECTION_HOLD_MS)
      .failOffsetX([-SELECTION_SLOP, SELECTION_SLOP])
      .failOffsetY([-SELECTION_SLOP, SELECTION_SLOP])
      .onStart((event) => {
        // Aqui o gesto ativou por TEMPO, com o dedo parado: a posição atual
        // ainda é o ponto onde ele pousou, e a translação é praticamente zero.
        const accepted = handlers.onStart(
          event.x - event.translationX,
          event.y - event.translationY,
        );
        if (!accepted) handlers.onCancel();
      })
      .onUpdate((event) => handlers.onMove(event.x, event.y))
      .onEnd((_event, success) => {
        if (success) handlers.onFinish();
      })
      // Cobre tudo o que não é um fim normal: toque cancelado pelo sistema,
      // gesto interrompido por outro, tela desmontada no meio. Sem isto, um
      // preview poderia ficar preso na tela.
      .onFinalize((_event, success) => {
        if (!success) handlers.onCancel();
      })
  );
}

export function IntervalSelectionSurface({
  enabled = true,
  onStart,
  onMove,
  onFinish,
  onCancel,
  children,
  style,
}: {
  readonly enabled?: boolean;
  /** Devolva `false` para recusar o gesto — por exemplo, sobre um bloco. */
  readonly onStart: (x: number, y: number) => boolean;
  readonly onMove: (x: number, y: number) => void;
  readonly onFinish: () => void;
  readonly onCancel: () => void;
  readonly children: ReactNode;
  readonly style?: View["props"]["style"];
}) {
  const pan = useMemo(() => {
    const handlers: SelectionHandlers = { onStart, onMove, onFinish, onCancel };

    return Platform.OS === "web"
      ? buildMouseGesture(handlers, enabled)
      : buildTouchGesture(handlers, enabled);
  }, [enabled, onStart, onMove, onFinish, onCancel]);

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.surface, style]}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    ...Platform.select({
      web: {
        // Arrastar sobre a agenda não pode ir marcando os rótulos de hora pelo
        // caminho.
        userSelect: "none",
        // `crosshair` diria melhor "aqui se desenha um intervalo", mas o React
        // Native só tipa 'auto' e 'pointer'. Um cursor mais expressivo não vale
        // um cast para fora do sistema de tipos.
        cursor: "pointer",
      },
      default: {},
    }),
  },
});
