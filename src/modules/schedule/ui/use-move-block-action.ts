import { useCallback, useEffect, useMemo, useState } from "react";

import { isAppError } from "@/lib/errors";
import { formatTimeRangeInTimeZone, type CalendarDate, type TimeOfDay } from "@/lib/time";

import { useUpdateScheduleBlock } from "../data/schedule-queries";
import { evaluateConflicts } from "../domain/conflict-policy";
import {
  resolveBlockInstants,
  type ScheduleBlockWithTask,
} from "../domain/schedule-block";

/**
 * Gravar um bloco movido — com desfazer.
 *
 * ## Por que desfazer importa aqui mais do que em qualquer outro lugar
 *
 * Arrastar é o gesto mais fácil de errar do produto: o dedo escorrega, o
 * telefone treme, e o bloco vai parar meia hora adiante sem que a pessoa
 * perceba. Todas as outras escritas do Merid passam por um formulário com um
 * botão de confirmar; esta acontece só de soltar o dedo.
 *
 * A implementação é deliberadamente pequena: guarda-se o intervalo ANTERIOR e
 * desfazer é a mesma operação de mover, na direção contrária. Não há pilha de
 * comandos, nem histórico, nem estado global — porque a única ação que precisa
 * disso é esta, e uma pilha para um item é cerimônia.
 *
 * ## Conflito: a mesma política, no formato que um gesto comporta
 *
 * A política do produto é WARN — detectar, avisar, deixar decidir. O formulário
 * a executa como um passo de confirmação, porque ali já existe um botão de
 * salvar para interceptar. Num arrasto não existe esse passo: a decisão foi
 * tomada quando o dedo levantou, e abrir um diálogo depois de cada arrasto
 * transformaria o gesto fluido em um formulário com etapas extras.
 *
 * Então o aviso vem DEPOIS, no mesmo lugar em que a confirmação já aparecia, e
 * a saída é o Desfazer que já estava ali. Nenhuma política nova: continua sendo
 * `evaluateConflicts`, e trocar a constante para BLOCK continua sendo uma linha
 * em `conflict-policy.ts`.
 *
 * ## Rollback
 *
 * A gravação é otimista (ver `useUpdateScheduleBlock`) e o rollback é do cache:
 * se a escrita falhar, o bloco volta sozinho para o horário antigo e aqui só
 * resta contar o que aconteceu. A UI nunca mostra um horário que o banco
 * recusou.
 */

/** Quanto tempo o aviso de "movido" fica na tela antes de sair sozinho. */
const UNDO_VISIBLE_MS = 7_000;
/** O erro fica mais tempo: quem não viu o arrasto precisa conseguir ler. */
const ERROR_VISIBLE_MS = 12_000;

type Undoable = {
  readonly blockId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly label: string;
};

export function useMoveBlockAction({
  timeZone,
  entries = [],
}: {
  readonly timeZone: string;
  /**
   * Os blocos já desenhados na tela, para avaliar sobreposição. Opcional: sem
   * eles o move continua funcionando, apenas sem o aviso de conflito.
   */
  readonly entries?: readonly ScheduleBlockWithTask[];
}) {
  const update = useUpdateScheduleBlock();

  const [undoable, setUndoable] = useState<Undoable | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Forma que `evaluateConflicts` consome — id no topo, instantes rasos. */
  const existing = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        id: entry.block.id,
        startsAt: entry.block.startsAt,
        endsAt: entry.block.endsAt,
      })),
    [entries],
  );

  /**
   * O aviso some sozinho.
   *
   * Sem isto a barra ficava para sempre sobre o rodapé da grade, cobrindo os
   * últimos horários do dia e engolindo os toques que caíssem ali — um efeito
   * colateral permanente para confirmar uma ação que durou um segundo.
   */
  useEffect(() => {
    if (undoable === null) return;
    const id = setTimeout(() => setUndoable(null), UNDO_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [undoable]);

  useEffect(() => {
    if (error === null) return;
    const id = setTimeout(() => setError(null), ERROR_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [error]);

  /**
   * O DIA vem por parâmetro, e não do hook: a semana move blocos de sete dias
   * diferentes com o mesmo controlador, e fixar a data aqui gravaria todos
   * eles no dia que estivesse em foco.
   */
  const move = useCallback(
    (
      entry: ScheduleBlockWithTask,
      date: CalendarDate,
      startTime: TimeOfDay,
      endTime: TimeOfDay,
    ) => {
      const next = resolveBlockInstants({ date, startTime, endTime }, timeZone);

      const range = formatTimeRangeInTimeZone(next.startsAt, next.endsAt, timeZone);
      const evaluation = evaluateConflicts(next, existing, { excludeId: entry.block.id });
      const overlap =
        evaluation.conflicts.length === 0
          ? ""
          : evaluation.conflicts.length === 1
            ? ` · sobrepõe ${evaluation.conflicts[0]?.task.title ?? "outro bloco"}`
            : ` · sobrepõe ${evaluation.conflicts.length} blocos`;

      update.mutate(
        { id: entry.block.id, startsAt: next.startsAt, endsAt: next.endsAt },
        {
          onSuccess: () => {
            setError(null);
            setUndoable({
              blockId: entry.block.id,
              // O horário ANTERIOR, que é para onde desfazer leva.
              startsAt: entry.block.startsAt,
              endsAt: entry.block.endsAt,
              label: `${entry.task.title} · ${range}${overlap}`,
            });
          },
          onError: (caught) => {
            setUndoable(null);
            setError(
              isAppError(caught) ? caught.message : "Não foi possível mover o bloco.",
            );
          },
        },
      );
    },
    [existing, timeZone, update],
  );

  const undo = useCallback(() => {
    if (undoable === null) return;

    update.mutate(
      { id: undoable.blockId, startsAt: undoable.startsAt, endsAt: undoable.endsAt },
      {
        onSuccess: () => setUndoable(null),
        // Desfazer que falha em silêncio é pior que não ter desfazer: a pessoa
        // acredita que voltou atrás e o bloco continua no lugar errado.
        onError: (caught) => {
          setUndoable(null);
          setError(
            isAppError(caught)
              ? caught.message
              : "Não foi possível desfazer. O bloco continua no horário novo.",
          );
        },
      },
    );
  }, [undoable, update]);

  const dismiss = useCallback(() => {
    setUndoable(null);
    setError(null);
  }, []);

  return { move, undo, dismiss, undoable, error, isSaving: update.isPending };
}
