import { z } from "zod";

import { validationError, type FieldErrors } from "@/lib/errors";

/**
 * Fronteira de validação do servidor.
 *
 * TODA entrada vinda do cliente passa por aqui. O frontend valida para dar
 * feedback rápido; o servidor valida porque é o único lugar em que confiamos.
 */

export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const fieldErrors: FieldErrors = {};
    const formErrors: string[] = [];

    // Percorremos as issues manualmente (em vez de usar um helper do Zod) para
    // que a forma do erro entregue à UI não mude junto com a versão do Zod.
    for (const issue of result.error.issues) {
      const field = issue.path[0];

      if (typeof field === "string") {
        const messages = fieldErrors[field] ?? [];
        messages.push(issue.message);
        fieldErrors[field] = messages;
      } else {
        formErrors.push(issue.message);
      }
    }

    throw validationError(formErrors[0] ?? "Confira os campos destacados.", fieldErrors);
  }

  return result.data;
}

/**
 * `FormData` -> objeto simples para o Zod.
 * Campos não preenchidos chegam como "" e são normalizados nos schemas.
 */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    entries[key] = typeof value === "string" ? value : undefined;
  }
  return entries;
}
