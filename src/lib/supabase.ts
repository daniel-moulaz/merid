import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import type { Database } from "./database.types";

/**
 * Cliente Supabase — o único ponto de acesso ao backend.
 *
 * Aqui não existe chave secreta. O app usa exclusivamente a chave publicável,
 * que sozinha não dá acesso a nada: quem autoriza é o RLS, avaliado no
 * Postgres a partir do JWT do usuário. Se esta chave vazar, ela continua não
 * lendo dado de ninguém.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY são obrigatórias. " +
      "Copie .env.example para .env e rode `npm run db:start`.",
  );
}

const isWeb = Platform.OS === "web";

/**
 * Durante o `expo export` a página é renderizada no Node, onde não existe
 * `window`. Sem esta guarda, o cliente tentaria ler `localStorage` e quebraria
 * a build da web.
 */
const isServerRendering = isWeb && typeof window === "undefined";

const noopStorage = {
  getItem: async (): Promise<string | null> => null,
  setItem: async (): Promise<void> => undefined,
  removeItem: async (): Promise<void> => undefined,
};

function resolveStorage() {
  if (isServerRendering) return noopStorage;
  // Na web, deixar `undefined` faz o supabase-js usar o localStorage.
  return isWeb ? undefined : AsyncStorage;
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: resolveStorage(),
      // Sessão sobrevive a fechar e reabrir o app.
      persistSession: !isServerRendering,
      autoRefreshToken: !isServerRendering,
      // No nativo não existe URL de callback para inspecionar.
      detectSessionInUrl: isWeb && !isServerRendering,
      flowType: "pkce",
    },
  },
);

/**
 * No nativo o timer de refresh precisa acompanhar o ciclo de vida do app:
 * enquanto ele está em segundo plano os timers são suspensos, e sem isso a
 * sessão volta expirada.
 */
if (!isWeb) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
