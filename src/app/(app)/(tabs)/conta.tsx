import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { isAppError } from "@/lib/errors";
import { spacing } from "@/theme/tokens";
import { useThemeColors } from "@/theme/use-theme";
import { useAuth } from "@/modules/auth/auth-context";
import { signOut } from "@/modules/auth/auth-service";
import {
  deviceTimeZone,
  useProfile,
  useUpdateTimeZone,
} from "@/modules/profile/profile-queries";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { ScreenHeader } from "@/ui/screen-header";
import { Text } from "@/ui/text";
import { TextField } from "@/ui/text-field";

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
        <ScreenHeader title="Conta" />

        <View style={styles.info}>
          <Field label="E-mail" value={session?.user.email ?? "—"} />
          <Field label="Nome" value={profile?.displayName ?? "—"} />
        </View>

        <TimeZoneSection currentTimeZone={profile?.timeZone ?? null} />

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

/**
 * O fuso horário — a única configuração do produto, e a mais consequente.
 *
 * Ele decide o que é "hoje", em que dia uma conclusão entra no histórico e onde
 * a agenda desenha cada bloco. É detectado no cadastro, mas a detecção pode
 * falhar (aí cai no padrão) e a pessoa pode mudar de país. Sem poder corrigi-lo,
 * um fuso errado ficava errado para sempre, deslocando o produto inteiro em
 * algumas horas sem nada explicando por quê.
 *
 * ## Por que não uma lista de fusos
 *
 * Uma lista IANA completa tem centenas de entradas e pediria busca, agrupamento
 * e rolagem — uma tela inteira para uma configuração que quase ninguém toca.
 * O caso real que precisa ser resolvido é "o fuso está errado", e para ele
 * bastam duas coisas: o botão que aplica o fuso do próprio aparelho (que
 * resolve praticamente todos os casos com um toque) e um campo para quem
 * precisa de outro. A validação é a mesma do resto da camada de tempo.
 */
function TimeZoneSection({
  currentTimeZone,
}: {
  readonly currentTimeZone: string | null;
}) {
  const colors = useThemeColors();
  const update = useUpdateTimeZone();

  const [isEditing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const device = deviceTimeZone();
  const differsFromDevice =
    device !== null && currentTimeZone !== null && device !== currentTimeZone;

  function apply(timeZone: string): void {
    setError(null);
    update.mutate(timeZone, {
      onSuccess: () => {
        setEditing(false);
        setDraft("");
      },
      onError: (caught) =>
        setError(
          isAppError(caught) ? caught.message : "Não foi possível salvar o fuso.",
        ),
    });
  }

  return (
    <View style={styles.section}>
      <Field label="Fuso horário" value={currentTimeZone ?? "—"} />

      <Text variant="caption" muted>
        O fuso horário define o que conta como &quot;hoje&quot; nas suas tarefas.
      </Text>

      {/* Só aparece quando há de fato uma divergência para resolver — o caso em
          que a pessoa viajou, mudou de país, ou a detecção do cadastro falhou. */}
      {differsFromDevice && !isEditing ? (
        <View style={[styles.suggestion, { borderColor: colors.border }]}>
          <Text variant="caption" muted>
            Este aparelho está em {device}.
          </Text>
          <Button
            label={`Usar ${device}`}
            variant="secondary"
            loading={update.isPending}
            onPress={() => apply(device)}
          />
        </View>
      ) : null}

      {isEditing ? (
        <View style={styles.editor}>
          <TextField
            label="Fuso horário (IANA)"
            placeholder="America/Sao_Paulo"
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => apply(draft)}
            error={error ?? undefined}
          />
          <View style={styles.editorActions}>
            <Button
              label="Cancelar"
              variant="ghost"
              onPress={() => {
                setEditing(false);
                setError(null);
              }}
              style={styles.editorAction}
            />
            <Button
              label="Salvar"
              loading={update.isPending}
              disabled={draft.trim() === ""}
              onPress={() => apply(draft)}
              style={styles.editorAction}
            />
          </View>
        </View>
      ) : (
        <Button
          label="Alterar fuso horário"
          variant="ghost"
          onPress={() => {
            setDraft(currentTimeZone ?? "");
            setEditing(true);
          }}
        />
      )}

      {!isEditing && error !== null ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
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
  container: { gap: spacing.lg },
  info: { gap: spacing.md },
  section: { gap: spacing.sm },
  field: { gap: 2 },
  suggestion: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  editor: { gap: spacing.sm },
  editorActions: { flexDirection: "row", gap: spacing.sm },
  editorAction: { flex: 1 },
});
