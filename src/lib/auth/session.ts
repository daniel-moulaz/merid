import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";
import { unauthorizedError } from "@/lib/errors";

/**
 * Ponto único de resolução do usuário da sessão.
 *
 * Hoje não existe login: em desenvolvimento a sessão é resolvida por
 * `DEV_USER_EMAIL`. Quando o login real entrar (Auth.js), APENAS o corpo de
 * `getCurrentUser` muda — nenhum caso de uso, action ou página precisa mudar.
 *
 * Invariante de segurança: `userId` NUNCA vem do cliente. Toda consulta é
 * escopada pelo id devolvido aqui.
 */

export type SessionUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  /** Timezone IANA — fonte de verdade para fronteiras de dia. */
  readonly timeZone: string;
};

/**
 * `cache` memoiza por requisição: várias chamadas na mesma renderização fazem
 * uma única consulta.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Atalho de desenvolvimento — desligado em produção por construção, para que
  // um deploy com a variável esquecida no ambiente não autentique ninguém.
  if (process.env.NODE_ENV === "production") return null;

  const email = process.env["DEV_USER_EMAIL"];
  if (!email) return null;

  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, timeZone: true },
  });
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw unauthorizedError(
      "Nenhum usuário de sessão. Rode `npm run db:seed` e confira DEV_USER_EMAIL no .env.",
    );
  }
  return user;
}
