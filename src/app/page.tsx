import { redirect } from "next/navigation";

/**
 * A raiz apontará para "Hoje" quando a agenda existir. Enquanto isso, a Inbox
 * é a única tela funcional.
 */
export default function HomePage() {
  redirect("/inbox");
}
