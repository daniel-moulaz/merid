import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";

import { isAppError } from "@/lib/errors";
import { spacing } from "@/theme/tokens";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { Text } from "@/ui/text";
import { TextField } from "@/ui/text-field";

import {
  signUpInputSchema,
  type SignUpFormValues,
  type SignUpInput,
} from "../auth-schemas";

/**
 * Formulário compartilhado por entrar e criar conta.
 *
 * O campo "nome" só aparece no cadastro; o schema o trata como opcional, então
 * a mesma validação serve aos dois modos.
 */

type AuthFormProps = {
  readonly mode: "signIn" | "signUp";
  readonly title: string;
  readonly subtitle: string;
  readonly submitLabel: string;
  readonly onSubmit: (input: SignUpInput) => Promise<void>;
  readonly footer: React.ReactNode;
};

export function AuthForm({
  mode,
  title,
  subtitle,
  submitLabel,
  onSubmit,
  footer,
}: AuthFormProps) {
  const [formError, setFormError] = useState<string | null>(null);

  // Três genéricos: o formulário trabalha com os valores de ENTRADA e o
  // `handleSubmit` entrega os valores já transformados pelo Zod.
  const { control, handleSubmit, formState } = useForm<SignUpFormValues, unknown, SignUpInput>({
    resolver: zodResolver(signUpInputSchema),
    defaultValues: { email: "", password: "", displayName: null },
    mode: "onSubmit",
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(
        isAppError(error) ? error.message : "Não foi possível concluir. Tente novamente.",
      );
    }
  });

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text variant="title">{title}</Text>
            <Text muted>{subtitle}</Text>
          </View>

          <View style={styles.fields}>
            {mode === "signUp" ? (
              <Controller
                control={control}
                name="displayName"
                render={({ field }) => (
                  <TextField
                    label="Nome (opcional)"
                    value={field.value ?? ""}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    autoCapitalize="words"
                    autoComplete="name"
                    textContentType="name"
                    error={formState.errors.displayName?.message}
                  />
                )}
              />
            ) : null}

            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <TextField
                  label="E-mail"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  error={formState.errors.email?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field }) => (
                <TextField
                  label="Senha"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                  textContentType={mode === "signUp" ? "newPassword" : "password"}
                  onSubmitEditing={() => void submit()}
                  returnKeyType="go"
                  error={formState.errors.password?.message}
                />
              )}
            />
          </View>

          {formError === null ? null : (
            <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          )}

          <Button
            label={submitLabel}
            loading={formState.isSubmitting}
            onPress={() => void submit()}
          />

          <View style={styles.footer}>{footer}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", gap: spacing.lg, paddingVertical: spacing.xxl },
  header: { gap: spacing.xs },
  fields: { gap: spacing.md },
  footer: { alignItems: "center", marginTop: spacing.sm },
});
