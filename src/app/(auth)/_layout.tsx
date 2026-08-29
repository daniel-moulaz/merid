import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/modules/auth/auth-context";

/** Telas públicas. Quem já tem sessão não deveria vê-las. */
export default function AuthLayout() {
  const { session } = useAuth();

  if (session !== null) return <Redirect href="/hoje" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
