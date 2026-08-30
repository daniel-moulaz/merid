import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { isAppError } from "@/lib/errors";
import {
  addDaysToCalendarDate,
  DEFAULT_ESTIMATED_MINUTES,
  formatCalendarDateBR,
  type CalendarDate,
} from "@/lib/time";
import { control, radius, spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { Button } from "@/ui/button";
import { MiniCalendar } from "@/ui/mini-calendar";
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
 * ## Um campo na frente, o resto atrás de uma dobra
 *
 * Registrar uma ideia precisa custar uma frase. Quando duração, prazo e
 * prioridade aparecem todos de uma vez, a tela comunica "preencha um
 * formulário" — e o custo percebido de anotar "ligar pro dentista" fica maior
 * que o de não anotar. Aí a pessoa não anota, e a Inbox deixa de ser confiável.
 *
 * Então só o TÍTULO fica visível, com foco automático e Enter para salvar. Os
 * demais campos continuam todos ali, a um toque em "Mais opções" — nada foi
 * removido, só deixou de ser cobrado adiantado.
 *
 * Ao EDITAR, a dobra já abre: quem entrou para mudar alguma coisa quase nunca
 * veio mudar o título, e esconder o que a pessoa veio procurar seria trocar um
 * atrito por outro.
 *
 * Duração tem padrão e prazo tem atalhos "Hoje" e "Amanhã" — em um app de
 * agenda são as escolhas mais comuns, e digitar data é lento no celular.
 */

type TaskFormProps = {
  readonly today: CalendarDate;
  readonly initialValue?: Task | undefined;
  readonly submitLabel: string;
  readonly onSubmit: (input: CreateTaskInput) => Promise<void>;
  readonly onCancel?: (() => void) | undefined;
  /**
   * Excluir a tarefa.
   *
   * Mora aqui, e não na linha da lista, porque excluir é uma ação SOBRE a
   * tarefa: seu lugar é junto do resto dela, atrás da intenção de abrir. Na
   * linha ela ficava a um toque de distância da ação mais repetida do produto,
   * que é concluir.
   */
  readonly onDelete?: (() => void) | undefined;
  readonly autoFocus?: boolean;
};

export function TaskForm({
  today,
  initialValue,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  autoFocus = false,
}: TaskFormProps) {
  const colors = useThemeColors();
  const [formError, setFormError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(initialValue !== undefined);

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

      {showMore ? (
        <>
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

      <DueDateSection
        today={today}
        value={dueDate ?? null}
        error={formState.errors.dueDate?.message}
        onChange={(next) => setValue("dueDate", next, { shouldValidate: true })}
      />

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
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextField
            label="Notas"
            placeholder="Links, lembretes, o que precisar para fazer isso"
            value={field.value ?? ""}
            onChangeText={(text) => field.onChange(text === "" ? null : text)}
            onBlur={field.onBlur}
            multiline
            numberOfLines={4}
            error={formState.errors.description?.message}
          />
        )}
      />
        </>
      ) : (
        <Button
          label="Mais opções"
          variant="ghost"
          onPress={() => setShowMore(true)}
        />
      )}

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

      {onDelete === undefined ? null : (
        <View style={[styles.destructive, { borderTopColor: colors.border }]}>
          <Button label="Excluir tarefa" variant="ghost" size="md" onPress={onDelete} />
        </View>
      )}
    </View>
  );
}

/**
 * Prazo.
 *
 * ## O que mudou, e por quê
 *
 * Era um campo de texto pedindo `AAAA-MM-DD` ao lado da duração. Três problemas
 * de uma vez: obrigava a digitar data num teclado de celular, usava um formato
 * que ninguém escreve no Brasil, e não respondia "que dia da semana cai isso?".
 *
 * Agora a estrutura segue o que a pessoa realmente quer, na ordem de
 * frequência: os atalhos resolvem a esmagadora maioria dos casos com um toque,
 * e o calendário — que não pede digitação nenhuma — cobre o resto. O campo de
 * texto sumiu; não há mais como digitar uma data inválida.
 */
function DueDateSection({
  today,
  value,
  error,
  onChange,
}: {
  readonly today: CalendarDate;
  readonly value: CalendarDate | null;
  readonly error?: string | undefined;
  readonly onChange: (value: CalendarDate | null) => void;
}) {
  const colors = useThemeColors();
  const [showsCalendar, setShowsCalendar] = useState(false);

  const tomorrow = addDaysToCalendarDate(today, 1);
  const nextWeek = addDaysToCalendarDate(today, 7);

  const shortcuts: readonly { readonly label: string; readonly value: CalendarDate | null }[] = [
    { label: "Hoje", value: today },
    { label: "Amanhã", value: tomorrow },
    { label: "Em 7 dias", value: nextWeek },
    { label: "Sem prazo", value: null },
  ];

  // A data escolhida à mão — a que nenhum atalho representa — merece aparecer
  // como escolha, e não sumir porque nenhum botão está aceso.
  const isCustom =
    value !== null && value !== today && value !== tomorrow && value !== nextWeek;

  return (
    <View style={styles.dueSection}>
      <Text variant="label" muted>
        Prazo
      </Text>

      <View style={styles.chips}>
        {shortcuts.map((shortcut) => (
          <Button
            key={shortcut.label}
            label={shortcut.label}
            variant={value === shortcut.value ? "secondary" : "ghost"}
            size="sm"
            onPress={() => onChange(shortcut.value)}
            style={styles.chip}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showsCalendar }}
        accessibilityLabel={
          value === null
            ? "Escolher data no calendário"
            : `Prazo em ${formatCalendarDateBR(value)}. Escolher outra data no calendário.`
        }
        onPress={() => setShowsCalendar((shown) => !shown)}
        style={({ pressed }) => [
          styles.calendarToggle,
          {
            borderColor: isCustom ? colors.accent : colors.border,
            backgroundColor: pressed ? colors.surfaceRaised : "transparent",
          },
        ]}
      >
        <Text variant="label" muted={value === null}>
          {value === null ? "Escolher no calendário" : formatCalendarDateBR(value)}
        </Text>
        <Text variant="caption" style={{ color: colors.accent }}>
          {showsCalendar ? "Fechar" : "Calendário"}
        </Text>
      </Pressable>

      {showsCalendar ? (
        <MiniCalendar
          value={value}
          today={today}
          onChange={onChange}
          accessibilityLabel="Prazo"
        />
      ) : null}

      {error === undefined || error === "" ? null : (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  dueSection: { gap: spacing.sm },
  chips: { flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" },
  chip: { flexGrow: 1, flexBasis: 76 },
  calendarToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    minHeight: control.minTouch,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
  /** Separado por uma linha: o que apaga não divide espaço com o que salva. */
  destructive: {
    alignItems: "flex-start",
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
