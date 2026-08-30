import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { isAppError } from "@/lib/errors";
import {
  formatCalendarDate,
  formatMinutes,
  minutesBetween,
  type CalendarDate,
  type TimeOfDay,
} from "@/lib/time";
import { radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useCreateTask, useUpdateTask } from "@/modules/tasks/data/task-queries";
import { DEFAULT_TASK_PRIORITY } from "@/modules/tasks/domain/task";
import { Button } from "@/ui/button";
import { Text } from "@/ui/text";
import { TextField } from "@/ui/text-field";

import { useCreateScheduleBlock, useDayBlocks } from "../data/schedule-queries";
import { evaluateConflicts } from "../domain/conflict-policy";
import {
  resolveBlockInstants,
  type ScheduleBlockWithTask,
} from "../domain/schedule-block";

/**
 * Criar direto no calendário.
 *
 * ## Por que esta tela existe
 *
 * Tocar um horário vazio abria "Qual tarefa?" — e essa é a pergunta errada.
 * Quem está olhando a agenda está pensando em TEMPO, e quer colocar algo às
 * 14:00; obrigá-la a escolher entre entidades que já existem transfere para a
 * pessoa um problema que é da arquitetura. A resposta mais frequente para
 * "o que vai acontecer às 14:00?" é uma coisa nova.
 *
 * Então o padrão passou a ser criar, e usar uma tarefa existente virou a
 * alternativa — que continua a um toque de distância, porque também é um caso
 * real, só que menos comum.
 *
 * ## Um campo só
 *
 * Só o título é pedido. Prioridade, prazo e descrição existem e continuam
 * editáveis na tarefa depois; pedi-los agora transformaria "lembrar de uma
 * coisa" em preencher um formulário, que é exatamente o atrito que faz as
 * pessoas não registrarem nada.
 *
 * A **estimativa vem da duração do bloco**, e não de um padrão fixo. Quem
 * arrastou de 14:00 às 15:30 já respondeu "quanto tempo isto leva" com o
 * gesto; perguntar de novo seria duvidar da resposta. As duas grandezas
 * seguem independentes depois disso — mudar a reserva não mexe na estimativa,
 * e vice-versa.
 */
export function QuickCreate({
  date,
  startTime,
  endTime,
  timeZone,
  onCreated,
  onUseExisting,
  onCancel,
}: {
  readonly date: CalendarDate;
  readonly startTime: TimeOfDay;
  readonly endTime: TimeOfDay;
  readonly timeZone: string;
  readonly onCreated: (date: CalendarDate) => void;
  readonly onUseExisting: () => void;
  readonly onCancel: () => void;
}) {
  const colors = useThemeColors();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const createBlock = useCreateScheduleBlock();

  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * A tarefa que já foi gravada numa tentativa anterior, quando o agendamento
   * falhou depois dela. Um ref e não estado: reaproveitá-la não muda a tela.
   */
  const created = useRef<{ readonly id: string; readonly title: string } | null>(null);
  /** Conflitos aguardando decisão. `null` = nada pendente. */
  const [pendingConflicts, setPendingConflicts] = useState<
    readonly ScheduleBlockWithTask[] | null
  >(null);

  const candidate = useMemo(
    () => resolveBlockInstants({ date, startTime, endTime }, timeZone),
    [date, startTime, endTime, timeZone],
  );

  const durationMinutes = minutesBetween(candidate.startsAt, candidate.endsAt);

  // Mesma política de conflito do formulário completo — não existe uma segunda
  // regra só porque a tela é mais curta.
  const dayBlocks = useDayBlocks(date);
  const existing = useMemo(
    () =>
      (dayBlocks.data ?? []).map((entry) => ({
        ...entry,
        id: entry.block.id,
        startsAt: entry.block.startsAt,
        endsAt: entry.block.endsAt,
      })),
    [dayBlocks.data],
  );

  const trimmed = title.trim();
  const canSubmit = trimmed.length > 0;
  const isBusy = createTask.isPending || updateTask.isPending || createBlock.isPending;

  async function submit(ignoreConflicts: boolean): Promise<void> {
    if (!canSubmit) return;
    setError(null);

    if (!ignoreConflicts) {
      const evaluation = evaluateConflicts(candidate, existing);
      if (evaluation.decision === "CONFIRM") {
        setPendingConflicts(evaluation.conflicts);
        return;
      }
    }

    const fields = {
      description: null,
      estimatedMinutes: durationMinutes,
      priority: DEFAULT_TASK_PRIORITY,
      dueDate: null,
    } as const;

    try {
      // A tarefa nasce primeiro porque o bloco precisa do id dela. Se o segundo
      // passo falhar, ela FICA — uma tarefa sem horário na Inbox é recuperável
      // e visível, ao contrário de um bloco órfão.
      //
      // E é justamente por ela ficar que o id é lembrado: sem isto, tocar
      // "Criar e agendar" de novo depois de uma queda de rede criava uma
      // SEGUNDA tarefa igual e abandonava a primeira. A tentativa seguinte
      // reaproveita a tarefa já gravada e só refaz o passo que faltou.
      const reused = created.current;
      const taskId =
        reused === null
          ? (await createTask.mutateAsync({ title: trimmed, ...fields })).id
          : reused.id;

      created.current = { id: taskId, title: trimmed };

      // O título pode ter mudado entre a falha e a nova tentativa; então o
      // bloco apareceria com o texto antigo. Uma escrita a mais só no caso
      // raro em que isso aconteceu.
      if (reused !== null && reused.title !== trimmed) {
        await updateTask.mutateAsync({ id: taskId, title: trimmed, ...fields });
      }

      await createBlock.mutateAsync({
        taskId,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
      });

      created.current = null;
      onCreated(date);
    } catch (caught) {
      const message = isAppError(caught) ? caught.message : null;

      setError(
        created.current === null
          ? (message ?? "Não foi possível criar o agendamento.")
          : // A tarefa sobreviveu: dizer isso evita que a pessoa ache que
            // perdeu o que escreveu e cadastre tudo de novo.
            `${message ?? "Não foi possível agendar."} A tarefa foi salva e está na Inbox, sem horário.`,
      );
    }
  }

  /** Qualquer mudança invalida uma confirmação de conflito já dada. */
  function changeTitle(value: string): void {
    setPendingConflicts(null);
    setTitle(value);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="heading">Novo bloco</Text>
        {/* O QUANDO já está decidido e aparece como fato, não como campo:
            editá-lo aqui competiria com o gesto que acabou de defini-lo. */}
        <Text variant="caption" muted>
          {capitalizeFirst(
            formatCalendarDate(date, { weekday: "long", day: "numeric", month: "long" }),
          )}{" "}
          · {startTime} → {endTime} · {formatMinutes(durationMinutes)}
        </Text>
      </View>

      <TextField
        label="O que você vai fazer?"
        placeholder="Estudar AEDS"
        value={title}
        onChangeText={changeTitle}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void submit(false)}
      />

      {pendingConflicts === null ? null : (
        <View
          style={[
            styles.conflict,
            { borderColor: colors.warning, backgroundColor: colors.surface },
          ]}
        >
          <Text variant="caption" style={{ color: colors.warning }}>
            Esse horário se sobrepõe a {pendingConflicts.length === 1 ? "um bloco" : "blocos"}:
          </Text>
          {pendingConflicts.map((conflict) => (
            <Text key={conflict.block.id} variant="caption" muted numberOfLines={1}>
              {conflict.task.title}
            </Text>
          ))}
        </View>
      )}

      {error === null ? null : (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      <View style={styles.actions}>
        <Button
          label={pendingConflicts === null ? "Criar e agendar" : "Agendar mesmo assim"}
          disabled={!canSubmit}
          loading={isBusy}
          onPress={() => void submit(pendingConflicts !== null)}
        />

        {/* Menos comum, mas real: a tarefa já existe e só falta um horário. */}
        <Button label="Usar uma tarefa existente" variant="secondary" onPress={onUseExisting} />
        <Button label="Cancelar" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

/** "domingo, 30 de agosto" -> "Domingo, 30 de agosto". */
function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { gap: 2 },
  conflict: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actions: { gap: spacing.sm },
});
