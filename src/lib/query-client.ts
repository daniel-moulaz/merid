import { QueryClient } from "@tanstack/react-query";

import { isAppError } from "./errors";

/**
 * Erros que nunca melhoram com nova tentativa: repetir só atrasa o feedback.
 */
const NON_RETRYABLE = new Set(["VALIDATION", "UNAUTHORIZED", "NOT_FOUND", "CONFLICT"]);

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (isAppError(error) && NON_RETRYABLE.has(error.code)) return false;
          return failureCount < MAX_RETRIES;
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}
