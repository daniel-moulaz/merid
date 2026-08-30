/**
 * Os números que decidem de quem é o dedo.
 *
 * Vivem em um módulo próprio porque valem para DOIS gestos — criar um
 * intervalo e mover um bloco — e os dois precisam concordar. Se criar exigisse
 * meio segundo e mover exigisse um quarto, a agenda teria duas personalidades
 * na mesma tela.
 *
 * A regra em si é aplicada pelo reconhecedor nativo do
 * `react-native-gesture-handler`, não por código nosso; ver a nota longa em
 * `interval-selection-surface.tsx`.
 */

/**
 * Quanto tempo o dedo precisa ficar parado antes de um gesto de agenda começar.
 *
 * 400 ms: abaixo disso o gesto compete com o instante em que a pessoa apoia o
 * dedo para rolar, e "apoiar" vira "arrastar". Acima de meio segundo o toque
 * longo passa a parecer travado.
 */
export const SELECTION_HOLD_MS = 400;

/**
 * Folga, em pontos, que ainda conta como "dedo parado".
 *
 * Andar além disso ANTES da ativação faz o reconhecedor falhar — e um
 * reconhecedor que falhou não volta a ser candidato naquele gesto, que é
 * exatamente a garantia de que rolar nunca vira agendar.
 *
 * 10 pontos fica perto do `scaledTouchSlop` típico do Android sem depender
 * dele, e é pequeno o bastante para não atrapalhar quem está mirando.
 */
export const SELECTION_SLOP = 10;

/** Movimento a partir do qual o mouse está arrastando, e não clicando. */
export const MOUSE_DRAG_SLOP = 4;
