import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/modules/auth/auth-context";

/**
 * Guarda das telas autenticadas.
 *
 * É proteção de navegação, não de dados: mesmo que alguém contornasse esta
 * verificação, o RLS não devolveria linha nenhuma sem um JWT válido.
 *
 * A pilha existe por cima das abas para que "Agendar" possa aparecer como
 * folha modal sobre a agenda, sem perder o contexto da tela de baixo.
 */
export default function AppLayout() {
  const { session } = useAuth();

  if (session === null) return <Redirect href="/entrar" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="agendar" options={{ presentation: "modal" }} />
    </Stack>
  );
}
