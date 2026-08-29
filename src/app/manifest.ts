import type { MetadataRoute } from "next";

/**
 * PWA básica: o app é instalável e abre em janela própria.
 * Ainda NÃO há service worker (offline e push ficam para a etapa de
 * notificações).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agenda pessoal",
    short_name: "Agenda",
    description: "Tarefas com duração, agendadas em blocos de tempo reais.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    lang: "pt-BR",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
