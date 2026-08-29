import { Link } from "expo-router";

import { signUp } from "@/modules/auth/auth-service";
import { AuthForm } from "@/modules/auth/ui/auth-form";
import { Text } from "@/ui/text";

export default function SignUpScreen() {
  return (
    <AuthForm
      mode="signUp"
      title="Criar conta"
      subtitle="Leva menos de um minuto."
      submitLabel="Criar conta"
      onSubmit={async (input) => {
        // Após o cadastro a sessão já vem ativa (confirmação de e-mail
        // desligada no ambiente local): o guard de rota redireciona sozinho.
        await signUp(input);
      }}
      footer={
        <Link href="/entrar">
          <Text variant="label" muted>
            Já tem conta? Entrar
          </Text>
        </Link>
      }
    />
  );
}
