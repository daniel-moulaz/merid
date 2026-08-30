import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/theme/tokens";

import { Text } from "./text";

/**
 * Cabeçalho de tela.
 *
 * ## Por que virou um componente
 *
 * As cinco telas montavam o próprio cabeçalho, e nenhuma concordava com as
 * outras: Hoje e Agenda abriam com `paddingTop: md`, Inbox e Conta com `lg`;
 * o título e o subtítulo tinham `gap: 2` em duas telas e nenhum nas outras; a
 * linha de resumo às vezes era `caption`, às vezes `label`. Nada disso era
 * decisão — era o acúmulo de cinco arquivos escritos em momentos diferentes. O
 * efeito somado é o que faz um aplicativo parecer montado em vez de desenhado.
 *
 * Agora existe um cabeçalho, com três papéis fixos:
 *
 *   `title`     onde a pessoa está — "Hoje", "Inbox", "24 – 30 de agosto"
 *   `subtitle`  o que isso quer dizer — a data por extenso, a semana relativa
 *   `summary`   quanto há aqui — "3 blocos · 2 h 30 planejados"
 *
 * O `summary` é uma linha de FATO, nunca de instrução: ele conta o que existe,
 * e some quando não há nada a contar em vez de virar um texto de ajuda.
 */
export function ScreenHeader({
  title,
  subtitle,
  summary,
  trailing,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** Linha factual sobre o conteúdo. Omita quando não houver o que dizer. */
  readonly summary?: string | undefined;
  /** Controle à direita do título — normalmente a navegação de período. */
  readonly trailing?: ReactNode;
  /** Faixa extra abaixo do cabeçalho: erro, seletor de visão, busca. */
  readonly children?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="title" numberOfLines={1}>
            {title}
          </Text>
          {subtitle === undefined ? null : (
            <Text variant="label" muted numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {trailing}
      </View>

      {summary === undefined ? null : (
        <Text variant="caption" muted numberOfLines={1}>
          {summary}
        </Text>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, paddingTop: spacing.md, paddingBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  text: { gap: spacing.xxs, flexShrink: 1 },
});
