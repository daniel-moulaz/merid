import { Link } from "expo-router";

import { signIn } from "@/modules/auth/auth-service";
import { AuthForm } from "@/modules/auth/ui/auth-form";
import { Text } from "@/ui/text";

export default function SignInScreen() {
  return (
    <AuthForm
      mode="signIn"
      title="Entrar"
      subtitle="Dê direção ao seu tempo."
      submitLabel="Entrar"
      onSubmit={async ({ email, password }) => {
        await signIn({ email, password });
      }}
      footer={
        <Link href="/criar-conta">
          <Text variant="label" muted>
            Não tem conta? Criar conta
          </Text>
        </Link>
      }
    />
  );
}
