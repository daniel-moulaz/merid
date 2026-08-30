import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { isAppError } from "@/lib/errors";
import {
  ceilTimeOfDayToStep,
  formatMinutes,
  formatTimeRangeInTimeZone,
  minutesBetween,
  timeOfDayInTimeZone,
  toCalendarDateInTimeZone,
  todayInTimeZone,
  type CalendarDate,
  type TimeOfDay,
} from "@/lib/time";
import { fontWeight, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import type { Task } from "@/modules/tasks/domain/task";
import { Button } from "@/ui/button";
import { ChoiceChips } from "@/ui/choice-chips";
import { DateField } from "@/ui/date-field";
import { Text } from "@/ui/text";
import { TimeField, TIME_STEP_MINUTES } from "@/ui/time-field";

import {
  useCreateScheduleBlock,
  useDayBlocks,
  useUpdateScheduleBlock,
} from "../data/schedule-queries";
import {
  resolveBlockInstants,
  suggestEndTime,
  type ScheduleBlock,
  type ScheduleBlockWithTask,
} from "../domain/schedule-block";
import { evaluateConflicts } from "../domain/conflict-policy";

/**
 * Formulário de agendamento — cria um bloco novo ou reagenda um existente.
 *
 * O caminho rápido é o padrão: chega com data, início e fim já preenchidos, e
 * confirmar basta. O fim vem de `início + estimatedMinutes` da tarefa, mas é
 * só uma SUGESTÃO — mudar a duração do bloco não altera a estimativa da tarefa
 * (R4 do produto). Nada aqui escreve em `task`.
 *
 * **Composição.** Duas seções, "Quando" e "Horário", em vez de oito controles
 * empilhados sem hierarquia. A duração planejada deixou de ser um cartão
 * próprio e virou o valor à direita do rótulo "Fim" — é onde ela é lida, e a
 * tela ficou um bloco mais curta. As observações (vira o dia, estimativa
 * diferente) só aparecem quando são verdade, em vez de ocupar altura fixa.
 */

/** Durações de atalho, em minutos. */
const DURATION_SHORTCUTS = [15, 30, 45, 60, 90, 120] as const;

export function ScheduleForm({
  task,
  timeZone,
  initialBlock,
  initialDate,
  initialStartTime,
  initialEndTime,
  onDone,
  onCancel,
}: {
  readonly task: Task;
  readonly timeZone: string;
  readonly initialBlock?: ScheduleBlock | undefined;
  /** Dia sugerido — o que estava sendo visto na agenda. Padrão: hoje. */
  readonly initialDate?: CalendarDate | undefined;
  /**
   * Início sugerido — a faixa tocada na grade semanal. Padrão: o próximo passo
   * do relógio. O fim continua vindo da estimativa da tarefa, então tocar as
   * 14:00 numa tarefa de 90 min já chega com 14:00 → 15:30 preenchido.
   */
  readonly initialStartTime?: TimeOfDay | undefined;
  /**
   * Fim escolhido explicitamente — o arrasto na agenda.
   *
   * Tem prioridade sobre `estimatedMinutes`: quem desenhou 14:00 → 15:30 disse
   * quanto tempo quer reservar, e a estimativa da tarefa é só um palpite para
   * quando ninguém disse nada. Sobrescrever a escolha explícita seria a
   * ferramenta discordando de uma instrução direta.
   *
   * A estimativa da tarefa continua intacta: o bloco reserva 1h30, a tarefa
   * segue estimada em 30 min, e o formulário avisa quando os dois divergem.
   */
  readonly initialEndTime?: TimeOfDay | undefined;
  /** Recebe o dia agendado, para a agenda abrir já nele. */
  readonly onDone: (date: CalendarDate) => void;
  readonly onCancel: () => void;
}) {
  const colors = useThemeColors();
  const create = useCreateScheduleBlock();
  const update = useUpdateScheduleBlock();

  const today = todayInTimeZone(timeZone);

  const [values, setValues] = useState(() =>
    initialFormValues(
      task,
      initialBlock,
      timeZone,
      initialDate ?? today,
      initialStartTime,
      initialEndTime,
    ),
  );
  const [formError, setFormError] = useState<string | null>(null);
  /** Conflitos aguardando decisão do usuário. `null` = nada pendente. */
  const [pendingConflicts, setPendingConflicts] = useState<readonly ScheduleBlockWithTask[] | null>(
    null,
  );

  const candidate = useMemo(
    () => resolveBlockInstants(values, timeZone),
    [values, timeZone],
  );

  const durationMinutes = minutesBetween(candidate.startsAt, candidate.endsAt);

  /**
   * Um bloco pode atravessar a meia-noite. Quando isso acontece, o horário
   * também precisa ser checado contra os blocos do dia seguinte — por isso as
   * duas consultas. Quando as datas coincidem, o TanStack Query serve a mesma
   * chave e não há requisição extra.
   */
  const endDate = toCalendarDateInTimeZone(candidate.endsAt, timeZone);
  const startDayBlocks = useDayBlocks(values.date);
  const endDayBlocks = useDayBlocks(endDate);

  const existingBlocks = useMemo(() => {
    const merged = new Map<string, ScheduleBlockWithTask>();
    for (const entry of [...(startDayBlocks.data ?? []), ...(endDayBlocks.data ?? [])]) {
      merged.set(entry.block.id, entry);
    }
    return [...merged.values()].map((entry) => ({
      ...entry,
      id: entry.block.id,
      startsAt: entry.block.startsAt,
      endsAt: entry.block.endsAt,
    }));
  }, [startDayBlocks.data, endDayBlocks.data]);

  /** Qualquer mudança de horário invalida uma confirmação já dada. */
  function change(patch: Partial<typeof values>): void {
    setPendingConflicts(null);
    setFormError(null);
    setValues((current) => ({ ...current, ...patch }));
  }

  /** Mudar o início preserva a duração escolhida, como em qualquer calendário. */
  function changeStart(startTime: TimeOfDay): void {
    change({ startTime, endTime: suggestEndTime(startTime, durationMinutes) });
  }

  function setDuration(minutes: number): void {
    change({ endTime: suggestEndTime(values.startTime, minutes) });
  }

  const isSaving = create.isPending || update.isPending;

  async function save(): Promise<void> {
    setFormError(null);

    try {
      if (initialBlock === undefined) {
        await create.mutateAsync({ taskId: task.id, ...candidate });
      } else {
        await update.mutateAsync({ id: initialBlock.id, ...candidate });
      }
      onDone(values.date);
    } catch (error) {
      setFormError(isAppError(error) ? error.message : "Não foi possível agendar.");
    }
  }

  /**
   * A política de conflito NÃO mora aqui: este componente só executa a decisão
   * que `evaluateConflicts` devolveu. Trocar "avisar" por "bloquear" é uma
   * mudança em `conflict-policy.ts`, não neste arquivo.
   */
  function submit(): void {
    const evaluation = evaluateConflicts(candidate, existingBlocks, {
      excludeId: initialBlock?.id,
    });

    if (evaluation.decision === "REJECT") {
      setFormError("Esse horário já está ocupado.");
      return;
    }

    if (evaluation.decision === "CONFIRM") {
      setPendingConflicts(evaluation.conflicts);
      return;
    }

    void save();
  }

  const durationOptions = useMemo(() => {
    const minutes = new Set<number>([...DURATION_SHORTCUTS, task.estimatedMinutes]);
    return [...minutes]
      .sort((a, b) => a - b)
      .map((value) => ({ value, label: formatMinutes(value) }));
  }, [task.estimatedMinutes]);

  return (
    <View style={styles.container}>
      <View style={styles.taskHeader}>
        <Text variant="heading">{task.title}</Text>
        <Text variant="caption" muted>
          Estimativa da tarefa: {formatMinutes(task.estimatedMinutes)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="caption" muted style={styles.sectionTitle}>
          QUANDO
        </Text>
        <DateField
          label="Data"
          value={values.date}
          today={today}
          onChange={(date) => change({ date })}
        />
      </View>

      <View style={styles.section}>
        <Text variant="caption" muted style={styles.sectionTitle}>
          HORÁRIO
        </Text>

        <TimeField label="Início" value={values.startTime} onChange={changeStart} />

        <TimeField
          label="Fim"
          hint={formatMinutes(durationMinutes)}
          value={values.endTime}
          onChange={(endTime) => change({ endTime })}
        />

        <ChoiceChips
          label="Duração planejada"
          options={durationOptions}
          value={durationOptions.some((option) => option.value === durationMinutes)
            ? durationMinutes
            : null}
          onChange={setDuration}
        />

        {endDate === values.date ? null : (
          <Text variant="caption" style={{ color: colors.warning }}>
            Termina no dia seguinte, às {values.endTime}.
          </Text>
        )}
        {durationMinutes === task.estimatedMinutes ? null : (
          <Text variant="caption" muted>
            O bloco reserva {formatMinutes(durationMinutes)}; a estimativa da tarefa
            continua em {formatMinutes(task.estimatedMinutes)}.
          </Text>
        )}
      </View>

      {pendingConflicts === null ? null : (
        <ConflictWarning
          conflicts={pendingConflicts}
          timeZone={timeZone}
          onBack={() => setPendingConflicts(null)}
          onConfirm={() => void save()}
          isSaving={isSaving}
        />
      )}

      {formError === null ? null : (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      )}

      {pendingConflicts === null ? (
        <View style={styles.actions}>
          <Button label="Cancelar" variant="ghost" onPress={onCancel} style={styles.action} />
          <Button
            label={initialBlock === undefined ? "Agendar" : "Salvar"}
            loading={isSaving}
            onPress={submit}
            style={styles.action}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * O aviso de conflito mostra QUAL bloco atrapalha — sem isso o usuário não tem
 * como decidir. E a sobreposição pode ser intencional, então a saída não é um
 * beco: [Voltar] ou [Agendar mesmo assim].
 */
function ConflictWarning({
  conflicts,
  timeZone,
  onBack,
  onConfirm,
  isSaving,
}: {
  readonly conflicts: readonly ScheduleBlockWithTask[];
  readonly timeZone: string;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly isSaving: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.conflict, { borderColor: colors.warning, backgroundColor: colors.surface }]}
    >
      <Text variant="label" style={{ color: colors.warning }}>
        {conflicts.length === 1
          ? "Esse horário se sobrepõe a um bloco:"
          : `Esse horário se sobrepõe a ${conflicts.length} blocos:`}
      </Text>

      {conflicts.map((entry) => (
        <Text key={entry.block.id} variant="caption" muted>
          {entry.task.title} ·{" "}
          {formatTimeRangeInTimeZone(entry.block.startsAt, entry.block.endsAt, timeZone)}
        </Text>
      ))}

      <View style={styles.actions}>
        <Button label="Voltar" variant="ghost" onPress={onBack} style={styles.action} />
        <Button
          label="Agendar mesmo assim"
          loading={isSaving}
          onPress={onConfirm}
          style={styles.action}
        />
      </View>
    </View>
  );
}

type FormValues = {
  readonly date: CalendarDate;
  readonly startTime: TimeOfDay;
  readonly endTime: TimeOfDay;
};

/**
 * Valores iniciais.
 *
 * Ao editar, o bloco é lido no fuso do usuário. Ao criar, propõe-se o próximo
 * intervalo de 15 minutos a partir de agora, e o fim vem da estimativa da
 * tarefa — o formulário abre pronto para confirmar.
 */
function initialFormValues(
  task: Task,
  block: ScheduleBlock | undefined,
  timeZone: string,
  date: CalendarDate,
  suggestedStart?: TimeOfDay | undefined,
  suggestedEnd?: TimeOfDay | undefined,
): FormValues {
  if (block !== undefined) {
    return {
      date: toCalendarDateInTimeZone(block.startsAt, timeZone),
      startTime: timeOfDayInTimeZone(block.startsAt, timeZone),
      endTime: timeOfDayInTimeZone(block.endsAt, timeZone),
    };
  }

  const startTime =
    suggestedStart ??
    ceilTimeOfDayToStep(timeOfDayInTimeZone(new Date(), timeZone), TIME_STEP_MINUTES);

  return {
    date,
    startTime,
    // O fim explícito ganha da estimativa. Ver `initialEndTime`.
    endTime: suggestedEnd ?? suggestEndTime(startTime, task.estimatedMinutes),
  };
}

const styles = StyleSheet.create({
  container: { gap: spacing.xl },
  taskHeader: { gap: 2 },
  // As seções respiram mais entre si (xl) do que internamente (md): é o
  // agrupamento que faz a tela parecer curta, não a remoção de campos.
  section: { gap: spacing.md },
  sectionTitle: { letterSpacing: 0.6, fontWeight: fontWeight.semibold },
  conflict: {
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
});
