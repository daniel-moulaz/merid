import type { ReactNode } from "react";

import { AppNav } from "@/components/app-nav";

/**
 * Moldura do aplicativo: navegação lateral no desktop, barra no topo no
 * celular. O conteúdo tem largura máxima confortável para leitura de agenda.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:flex">
      <header className="border-b px-4 py-3 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:px-3 md:py-6">
        <p className="mb-3 px-3 text-sm font-semibold tracking-tight md:mb-6">
          Agenda pessoal
        </p>
        <AppNav />
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8 md:py-12">{children}</main>
    </div>
  );
}
