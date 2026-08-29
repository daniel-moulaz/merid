import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase";

/**
 * Sessão do usuário, disponível para todo o app.
 *
 * É a única fonte de verdade sobre "quem está logado". Nenhuma tela recebe o
 * id do usuário por parâmetro — e nenhuma escrita envia o id ao servidor: o
 * dono do dado é decidido pelo Postgres a partir do JWT.
 */

type AuthContextValue = {
  readonly session: Session | null;
  readonly userId: string | null;
  /** `true` até sabermos se existe sessão salva no dispositivo. */
  readonly isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let isMounted = true;

    // Sessão persistida (AsyncStorage no nativo, localStorage na web).
    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      setSession(nextSession);
      setIsLoading(false);

      // Sem isto, os dados em cache do usuário anterior continuariam visíveis
      // para quem logar em seguida no mesmo dispositivo.
      if (event === "SIGNED_OUT") queryClient.clear();
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ session, userId: session?.user.id ?? null, isLoading }),
    [session, isLoading],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext);
  if (context === null) {
    throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  }
  return context;
}
