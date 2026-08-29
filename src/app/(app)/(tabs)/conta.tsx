import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { isAppError } from "@/lib/errors";
import { spacing } from "@/theme/tokens";
import { useAuth } from "@/modules/auth/auth-context";
import { signOut } from "@/modules/auth/auth-service";
import { useProfile } from "@/modules/profile/profile-queries";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { Text } from "@/ui/text";

export default function AccountScreen() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);
    try {
      // O guard de rota redireciona sozinho quando a sessão cai, e o
      // AuthProvider limpa o cache do TanStack Query.
      await signOut();
    } catch (caught) {
      setError(isAppError(caught) ? caught.message : "Não foi possível sair.");
      setIsSigningOut(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <Text variant="title">Conta</Text>

        <View style={styles.info}>
          <Field label="E-mail" value={session?.user.email ?? "—"} />
          <Field label="Nome" value={profile?.displayName ?? "—"} />
          <Field label="Fuso horário" value={profile?.timeZone ?? "—"} />
        </View>

        <Text variant="caption" muted>
          O fuso horário define o que conta como &quot;hoje&quot; nas suas tarefas.
        </Text>

        {error === null ? null : (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        )}

        <Button
          label="Sair"
          variant="secondary"
          loading={isSigningOut}
          onPress={() => void handleSignOut()}
        />
      </View>
    </Screen>
  );
}

function Field({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.field}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingTop: spacing.lg },
  info: { gap: spacing.md },
  field: { gap: 2 },
});
