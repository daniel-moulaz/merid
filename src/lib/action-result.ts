import { isAppError, type AppErrorCode, type FieldErrors } from "@/lib/errors";

/**
 * Resultado de uma Server Action.
 *
 * Server Actions NÃO lançam para erros esperados: elas devolvem um resultado
 * discriminado. Assim a UI trata falha de validação e falha de negócio da mesma
 * forma, sem depender de error boundary.
 */

export type ActionError = {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly fieldErrors?: FieldErrors;
};

export type ActionResult<TData = undefined> =
  | { readonly ok: true; readonly data: TData }
  | { readonly ok: false; readonly error: ActionError };

export function actionOk(): ActionResult<undefined>;
export function actionOk<TData>(data: TData): ActionResult<TData>;
export function actionOk<TData>(data?: TData): ActionResult<TData | undefined> {
  return { ok: true, data };
}

export function actionFailed(error: ActionError): ActionResult<never> {
  return { ok: false, error };
}

const UNEXPECTED_MESSAGE = "Algo deu errado. Tente novamente.";

/**
 * Executa o corpo de uma Server Action convertendo exceções em `ActionResult`.
 *
 * - `AppError` -> vira mensagem para o usuário.
 * - Qualquer outra coisa -> logada no servidor, genérica para o usuário.
 */
export async function runAction<TData>(
  operation: () => Promise<TData>,
): Promise<ActionResult<TData>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (isAppError(error)) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        },
      };
    }

    console.error("[action] erro inesperado", error);
    return { ok: false, error: { code: "UNEXPECTED", message: UNEXPECTED_MESSAGE } };
  }
}
