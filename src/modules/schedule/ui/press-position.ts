import type { GestureResponderEvent } from "react-native";

/**
 * Onde, DENTRO do alvo, o toque caiu — ou `null` quando não houve posição.
 *
 * Cada plataforma nomeia isso de um jeito, e a diferença é real, não
 * cosmética: no nativo o evento vem do responder de toque e traz `locationY`;
 * na web o `onPress` do react-native-web nasce de um `click` do DOM, cujo
 * `nativeEvent` é um `MouseEvent` — ele tem `offsetY` e NÃO tem `locationY`.
 * Ler só `locationY` devolve `undefined` na web e produz um `NaN` silencioso
 * na conta seguinte.
 *
 * E quando o alvo é ativado pelo TECLADO (foco + Enter) não existe posição
 * nenhuma. Daí o `null` explícito em vez de um número inventado: quem chama
 * decide o padrão, em vez de agendar num horário inventado.
 *
 * A leitura é por chave e validada em tempo de execução porque os tipos do
 * React Native descrevem o evento nativo, não o do DOM: o campo existe na web,
 * mas não no tipo. Nada aqui silencia erro — o valor só é aceito se for mesmo
 * um número finito.
 *
 * `Reflect.get` e não desestruturação: em um `MouseEvent` do DOM, `offsetY` é
 * um getter do PROTÓTIPO, e qualquer cópia por espalhamento o perderia.
 *
 * Vive em um módulo próprio porque a tela Hoje e a da semana precisam
 * exatamente da mesma leitura — e porque a segunda cópia dela, escrita à mão,
 * reintroduziu o `NaN` que a primeira já tinha corrigido.
 */
export function pressOffsetY(event: GestureResponderEvent): number | null {
  for (const key of ["locationY", "offsetY"]) {
    const value: unknown = Reflect.get(event.nativeEvent, key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }

  return null;
}
