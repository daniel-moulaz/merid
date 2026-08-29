import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { isAppError } from "@/lib/errors";
import {
  addDaysToCalendarDate,
  DEFAULT_ESTIMATED_MINUTES,
  formatCalendarDate,
  type CalendarDate,
} from "@/lib/time";
import { spacing } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { SegmentedField } from "@/ui/segmented-field";
import { Text } from "@/ui/text";
import { TextField } from "@/ui/text-field";

import {
  DEFAULT_TASK_PRIORITY,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  type Task,
} from "../domain/task";
import {
  createTaskInputSchema,
  type CreateTaskFormValues,
  type CreateTaskInput,
} from "../domain/task-schemas";

/**
 * Formulário de tarefa, usado para criar e para editar.
 *
 * Duração é obrigatória e tem valor padrão: o caminho rápido é digitar o
 * título e confirmar. Prazo tem atalhos "Hoje" e "Amanhã" — em um app de
 * agenda são as escolhas mais comuns, e digitar data é lento no celular.
 */

type TaskFormProps = {
  readonly today: CalendarDate;
  readonly initialValue?: Task | undefined;
  readonly submitLabel: string;
  readonly onSubmit: (input: CreateTaskInput) => Promise<void>;
  readonly onCancel?: (() => void) | undefined;
  readonly autoFocus?: boolean;
};

export function TaskForm({
  today,
  initialValue,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: TaskFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  const { control, handleSubmit, formState, reset, setValue } = useForm<
    CreateTaskFormValues,
    unknown,
    CreateTaskInput
  >({
    resolver: zodResolver(createTaskInputSchema),
    defaultValues: {
      title: initialValue?.title ?? "",
      description: initialValue?.description ?? null,
      estimatedMinutes: initialValue?.estimatedMinutes ?? DEFAULT_ESTIMATED_MINUTES,
      priority: initialValue?.priority ?? DEFAULT_TASK_PRIORITY,
      dueDate: initialValue?.dueDate ?? null,
    },
  });

  // `useWatch` em vez de `watch()`: devolve um valor em vez de uma função, o
  // que mantém o componente compilável pelo React Compiler.
  const dueDate = useWatch({ control, name: "dueDate" });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
      // Só limpa na criação: ao editar, a tela fecha.
      if (initialValue === undefined) {
        reset({
          title: "",
          description: null,
          estimatedMinutes: DEFAULT_ESTIMATED_MINUTES,
          priority: DEFAULT_TASK_PRIORITY,
          dueDate: null,
        });
      }
    } catch (error) {
      setFormError(isAppError(error) ? error.message : "Não foi possível salvar.");
    }
  });

  return (
    <View style={styles.container}>
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <TextField
            label="Título"
            hideLabel
            placeholder="O que precisa ser feito?"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoFocus={autoFocus}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            error={formState.errors.title?.message}
          />
        )}
      />

      <View style={styles.row}>
        <View style={styles.duration}>
          <Controller
            control={control}
            name="estimatedMinutes"
            render={({ field }) => (
              <TextField
                label="Duração (min)"
                value={String(field.value ?? "")}
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, "");
                  field.onChange(digits === "" ? Number.NaN : Number(digits));
                }}
                onBlur={field.onBlur}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={4}
                error={formState.errors.estimatedMinutes?.message}
              />
            )}
          />
        </View>

        <View style={styles.due}>
          <Controller
            control={control}
            name="dueDate"
            render={({ field }) => (
              <TextField
                label="Prazo (AAAA-MM-DD)"
                placeholder="sem prazo"
                value={field.value ?? ""}
                onChangeText={(text) => field.onChange(text === "" ? null : text)}
                onBlur={field.onBlur}
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="numeric"
                maxLength={10}
                error={formState.errors.dueDate?.message}
              />
            )}
          />
        </View>
      </View>

      <View style={styles.chips}>
        <DueDateChip
          label="Hoje"
          value={today}
          current={dueDate}
          onPress={(value) => setValue("dueDate", value, { shouldValidate: true })}
        />
        <DueDateChip
          label="Amanhã"
          value={addDaysToCalendarDate(today, 1)}
          current={dueDate}
          onPress={(value) => setValue("dueDate", value, { shouldValidate: true })}
        />
        <DueDateChip
          label="Sem prazo"
          value={null}
          current={dueDate}
          onPress={(value) => setValue("dueDate", value, { shouldValidate: true })}
        />
      </View>

      <Controller
        control={control}
        name="priority"
        render={({ field }) => (
          <SegmentedField
            label="Prioridade"
            value={field.value ?? DEFAULT_TASK_PRIORITY}
            onChange={field.onChange}
            options={TASK_PRIORITIES.map((priority) => ({
              value: priority,
              label: TASK_PRIORITY_LABEL[priority],
            }))}
          />
        )}
      />

      {formError === null ? null : (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      )}

      <View style={styles.actions}>
        {onCancel === undefined ? null : (
          <Button label="Cancelar" variant="ghost" onPress={onCancel} style={styles.action} />
        )}
        <Button
          label={submitLabel}
          loading={formState.isSubmitting}
          onPress={() => void submit()}
          style={styles.action}
        />
      </View>
    </View>
  );
}

function DueDateChip({
  label,
  value,
  current,
  onPress,
}: {
  readonly label: string;
  readonly value: CalendarDate | null;
  readonly current: CalendarDate | null | undefined;
  readonly onPress: (value: CalendarDate | null) => void;
}) {
  const isSelected = current === value;

  return (
    <Button
      label={value === null ? label : `${label} · ${formatCalendarDate(value)}`}
      variant={isSelected ? "secondary" : "ghost"}
      onPress={() => onPress(value)}
      style={styles.chip}
    />
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  duration: { flex: 1 },
  due: { flex: 1.4 },
  chips: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  chip: { minHeight: 34, paddingHorizontal: spacing.md, flexGrow: 1 },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
});
