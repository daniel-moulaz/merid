/**
 * Erros esperados do aplicativo.
 *
 * Regra: erros de negócio são MODELADOS (viram `AppError` e chegam à UI como
 * mensagem útil); erros inesperados são LOGADOS no servidor e chegam à UI como
 * mensagem genérica, sem vazar detalhes internos.
 */

export const APP_ERROR_CODES = [
  "VALIDATION",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "CONFLICT",
  /**
   * O pedido não chegou ao servidor, ou não voltou a tempo.
   *
   * É um código próprio porque a UI trata este caso de forma diferente de uma
   * falha de negócio: aqui vale tentar de novo, e a culpa não é do que a
   * pessoa digitou.
   */
  "NETWORK",
  "UNEXPECTED",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/** Erros por campo de formulário, no formato que a UI consome. */
export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors: FieldErrors | undefined;

  constructor(
    code: AppErrorCode,
    message: string,
    fieldErrors?: FieldErrors,
    // `cause` preserva o erro original para o log sem que ele chegue à tela:
    // a pessoa lê a mensagem tratada, e quem investiga tem a pilha inteira.
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function validationError(message: string, fieldErrors?: FieldErrors): AppError {
  return new AppError("VALIDATION", message, fieldErrors);
}

export function notFoundError(message = "Registro não encontrado."): AppError {
  return new AppError("NOT_FOUND", message);
}

export function unauthorizedError(message = "Sessão não encontrada."): AppError {
  return new AppError("UNAUTHORIZED", message);
}

export function conflictError(message: string): AppError {
  return new AppError("CONFLICT", message);
}
