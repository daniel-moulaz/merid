import type { PostgrestError, PostgrestSingleResponse } from "@supabase/supabase-js";

import { AppError, conflictError, notFoundError, validationError } from "./errors";

/**
 * Traduz erros do PostgREST/Postgres para erros do domínio.
 *
 * As `CHECK constraints` do banco são a última linha de defesa desta
 * arquitetura: sem servidor próprio, é o Postgres que recusa dado inválido.
 * Quando isso acontece, o usuário precisa ver uma mensagem útil, e não um
 * código SQL.
 */

/** Códigos SQLSTATE relevantes. */
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const INSUFFICIENT_PRIVILEGE = "42501";
/** PostgREST: `.single()` não encontrou linha (ou o RLS a escondeu). */
const NO_ROWS_RETURNED = "PGRST116";

/**
 * Mensagens por constraint. Manter alinhado com as migrations: se uma
 * constraint for renomeada, a mensagem genérica assume o lugar.
 */
const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  tasks_title_not_blank: "Informe um título.",
  tasks_title_max_length: "O título é longo demais.",
  tasks_description_max_length: "A descrição é longa demais.",
  tasks_estimated_minutes_range: "A duração precisa ficar entre 1 minuto e 24 horas.",
  tasks_status_matches_completed_at:
    "Estado inconsistente entre conclusão e data de conclusão.",
  profiles_time_zone_not_blank: "Informe um fuso horário.",
  profiles_display_name_not_blank: "O nome não pode ficar em branco.",
};

function findConstraintName(error: PostgrestError): string | undefined {
  for (const name of Object.keys(CHECK_CONSTRAINT_MESSAGES)) {
    if (error.message.includes(name)) return name;
  }
  return undefined;
}

export function mapPostgrestError(error: PostgrestError): AppError {
  switch (error.code) {
    case CHECK_VIOLATION: {
      const constraint = findConstraintName(error);
      return validationError(
        constraint === undefined
          ? "Os dados enviados são inválidos."
          : (CHECK_CONSTRAINT_MESSAGES[constraint] ?? "Os dados enviados são inválidos."),
      );
    }

    case UNIQUE_VIOLATION:
      return conflictError("Esse registro já existe.");

    case FOREIGN_KEY_VIOLATION:
      return validationError("Referência inválida.");

    case NO_ROWS_RETURNED:
      // Também é o que acontece quando o RLS esconde a linha de outro usuário:
      // do ponto de vista do cliente, ela simplesmente não existe.
      return notFoundError("Registro não encontrado.");

    case INSUFFICIENT_PRIVILEGE:
      return new AppError("UNAUTHORIZED", "Você não tem permissão para esta ação.");

    default:
      // Não repassamos `error.message` ao usuário: pode conter detalhe do
      // schema. Vai para o log, não para a tela.
      console.error("[supabase] erro não mapeado", error);
      return new AppError("UNEXPECTED", "Algo deu errado. Tente novamente.");
  }
}

/**
 * Desembrulha o `{ data, error }` do supabase-js, lançando `AppError`.
 * Centraliza o tratamento para que nenhuma tela precise repetir a checagem.
 */
export function unwrap<T>(result: PostgrestSingleResponse<T>): T {
  if (result.error !== null) throw mapPostgrestError(result.error);
  if (result.data === null) throw notFoundError("Registro não encontrado.");
  return result.data;
}
