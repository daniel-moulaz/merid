import { Redirect } from "expo-router";

import { useAuth } from "@/modules/auth/auth-context";

/**
 * Porta de entrada.
 *
 * Quem está autenticado cai em HOJE, não na Inbox: o produto é uma agenda, e a
 * primeira coisa a ver é o dia — não a lista do que falta.
 */
export default function IndexRoute() {
  const { session } = useAuth();
  return <Redirect href={session === null ? "/entrar" : "/hoje"} />;
}
