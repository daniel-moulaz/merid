import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors } from "@/lib/errors";
import { DEFAULT_ESTIMATED_MINUTES, MAX_ESTIMATED_MINUTES, MIN_ESTIMATED_MINUTES } from "@/lib/time";
import { cn } from "@/lib/utils";

import {
  DEFAULT_TASK_PRIORITY,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_TITLE_MAX_LENGTH,
  type Task,
} from "../domain/task";

/**
 * Campos compartilhados entre criar e editar tarefa.
 *
 * `<select>` nativo em vez de um combobox: no celular abre o seletor do
 * sistema (mais rápido) e funciona com FormData sem JavaScript.
 */

type TaskFormFieldsProps = {
  /** Prefixo dos ids — a página tem vários formulários simultâneos. */
  readonly idPrefix: string;
  readonly defaults?: Pick<Task, "title" | "estimatedMinutes" | "dueDate" | "priority"> | undefined;
  readonly fieldErrors?: FieldErrors | undefined;
  readonly autoFocusTitle?: boolean;
};

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 py-1 text-sm shadow-xs " +
  "outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function TaskFormFields({
  idPrefix,
  defaults,
  fieldErrors,
  autoFocusTitle = false,
}: TaskFormFieldsProps) {
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={id("title")} className="sr-only">
          Título
        </Label>
        <Input
          id={id("title")}
          name="title"
          placeholder="O que precisa ser feito?"
          maxLength={TASK_TITLE_MAX_LENGTH}
          defaultValue={defaults?.title ?? ""}
          autoFocus={autoFocusTitle}
          autoComplete="off"
          required
          aria-invalid={fieldErrors?.["title"] !== undefined}
          className="md:text-base"
        />
        <FieldError messages={fieldErrors?.["title"]} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={id("estimatedMinutes")} className="mb-1.5 text-xs text-muted-foreground">
            Duração (min)
          </Label>
          <Input
            id={id("estimatedMinutes")}
            name="estimatedMinutes"
            type="number"
            inputMode="numeric"
            min={MIN_ESTIMATED_MINUTES}
            max={MAX_ESTIMATED_MINUTES}
            step={5}
            defaultValue={defaults?.estimatedMinutes ?? DEFAULT_ESTIMATED_MINUTES}
            required
            aria-invalid={fieldErrors?.["estimatedMinutes"] !== undefined}
          />
          <FieldError messages={fieldErrors?.["estimatedMinutes"]} />
        </div>

        <div>
          <Label htmlFor={id("dueDate")} className="mb-1.5 text-xs text-muted-foreground">
            Prazo
          </Label>
          <Input
            id={id("dueDate")}
            name="dueDate"
            type="date"
            defaultValue={defaults?.dueDate ?? ""}
            aria-invalid={fieldErrors?.["dueDate"] !== undefined}
          />
          <FieldError messages={fieldErrors?.["dueDate"]} />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor={id("priority")} className="mb-1.5 text-xs text-muted-foreground">
            Prioridade
          </Label>
          <select
            id={id("priority")}
            name="priority"
            defaultValue={defaults?.priority ?? DEFAULT_TASK_PRIORITY}
            className={cn(selectClassName)}
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TASK_PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
          <FieldError messages={fieldErrors?.["priority"]} />
        </div>
      </div>
    </div>
  );
}

export function FieldError({ messages }: { readonly messages?: readonly string[] | undefined }) {
  if (!messages || messages.length === 0) return null;
  return <p className="mt-1 text-xs text-destructive">{messages[0]}</p>;
}
