import { z } from "zod";

/**
 * Validação de credenciais.
 *
 * O tamanho mínimo de senha precisa acompanhar o `minimum_password_length` do
 * `supabase/config.toml` — se divergir, o usuário passa pela validação local e
 * é recusado pelo servidor.
 */

export const MIN_PASSWORD_LENGTH = 8;
/** bcrypt trunca acima de 72 bytes; recusar é melhor do que truncar em silêncio. */
export const MAX_PASSWORD_LENGTH = 72;

const emailSchema = z
  .string("Informe um e-mail válido.")
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido."));

const passwordSchema = z
  .string("Informe uma senha.")
  .min(MIN_PASSWORD_LENGTH, `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`)
  .max(MAX_PASSWORD_LENGTH, "A senha é longa demais.");

export const signInInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignInInput = z.output<typeof signInInputSchema>;

export const signUpInputSchema = signInInputSchema.extend({
  displayName: z
    .string()
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    })
    .refine((value) => value === null || value.length <= 80, "Use no máximo 80 caracteres."),
});

export type SignUpInput = z.output<typeof signUpInputSchema>;
/** Tipo dos campos do formulário (antes das transformações). */
export type SignUpFormValues = z.input<typeof signUpInputSchema>;
