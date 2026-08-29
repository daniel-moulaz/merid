import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { createQueryClient } from "@/lib/query-client";
import { warnIfTimeZoneUnsupported } from "@/lib/time";
import { AuthProvider, useAuth } from "@/modules/auth/auth-context";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // `useState` com inicializador: um único QueryClient por montagem do app.
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    // Falha silenciosa de timezone viraria tarefa no dia errado. Ver
    // src/lib/time/time-zone-support.ts.
    warnIfTimeZoneUnsupported();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { isLoading } = useAuth();
  const colorScheme = useColorScheme();

  useEffect(() => {
    // Só libera a splash quando já sabemos se existe sessão salva — evita o
    // piscar da tela de login para quem já está autenticado.
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
