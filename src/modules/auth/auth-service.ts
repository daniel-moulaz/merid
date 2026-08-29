import { AuthError } from "@supabase/supabase-js";

import { AppError, conflictError, validationError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { parseInput } from "@/lib/validation";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "@/lib/time";

import {
  signInInputSchema,
  signUpInputSchema,
  type SignInInput,
  type SignUpInput,
} from "./auth-schemas";

/**
 * Operações de autenticação.
 *
 * O `user_id` das tarefas nunca é enviado pelo aplicativo: ele vem do JWT
 * emitido aqui, lido pelo Postgres via `auth.uid()`.
 */

/** Códigos de erro do Supabase Auth traduzidos para mensagens acionáveis. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar.",
  user_already_exists: "Já existe uma conta com esse e-mail.",
  email_exists: "Já existe uma conta com esse e-mail.",
  weak_password: "Escolha uma senha mais forte.",
  over_request_rate_limit: "Muitas tentativas. Aguarde um instante.",
  same_password: "A nova senha precisa ser diferente da atual.",
};

function mapAuthError(error: AuthError): AppError {
  const message = error.code === undefined ? undefined : AUTH_ERROR_MESSAGES[error.code];

  if (message !== undefined) {
    return error.code === "user_already_exists" || error.code === "email_exists"
      ? conflictError(message)
      : validationError(message);
  }

  console.error("[auth] erro não mapeado", error);
  return new AppError("UNEXPECTED", "Não foi possível concluir. Tente novamente.");
}

/**
 * Detecta o fuso horário do dispositivo para já criar o perfil com o valor
 * certo. Se o runtime não souber informar, cai no padrão — o usuário pode
 * corrigir depois na tela de conta.
 */
function detectDeviceTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export async function signUp(input: SignUpInput): Promise<void> {
  const { email, password, displayName } = parseInput(signUpInputSchema, input);

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Lido pelo trigger `handle_new_user` para popular o perfil.
      data: {
        display_name: displayName,
        time_zone: detectDeviceTimeZone(),
      },
    },
  });

  if (error !== null) throw mapAuthError(error);
}

export async function signIn(input: SignInInput): Promise<void> {
  const { email, password } = parseInput(signInInputSchema, input);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error !== null) throw mapAuthError(error);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error !== null) throw mapAuthError(error);
}
