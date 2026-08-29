/**
 * Códigos de erro do Prisma que o domínio precisa distinguir.
 *
 * A checagem é estrutural (pela propriedade `code`) em vez de `instanceof`
 * porque o caminho de importação da classe de erro muda entre versões do
 * client gerado — e um `instanceof` que silenciosamente para de bater
 * transformaria "não encontrado" em erro 500.
 */

/** "An operation failed because it depends on one or more records that were required but not found." */
const RECORD_NOT_FOUND = "P2025";

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

export function isRecordNotFoundError(error: unknown): boolean {
  return hasPrismaCode(error, RECORD_NOT_FOUND);
}
