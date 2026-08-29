"use client";

import { CalendarDays, Flame, FolderOpen, Inbox, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Navegação principal.
 *
 * A arquitetura de informação já reflete o produto final (agenda primeiro,
 * lista depois). Os destinos ainda não construídos aparecem desabilitados em
 * vez de levarem a páginas vazias.
 */

type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: typeof Inbox;
  readonly available: boolean;
};

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/hoje", label: "Hoje", icon: Sun, available: false },
  { href: "/semana", label: "Semana", icon: CalendarDays, available: false },
  { href: "/inbox", label: "Inbox", icon: Inbox, available: true },
  { href: "/projetos", label: "Projetos", icon: FolderOpen, available: false },
  { href: "/consistencia", label: "Consistência", icon: Flame, available: false },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Seções" className="flex gap-1 md:flex-col">
      {NAV_ITEMS.map(({ href, label, icon: Icon, available }) => {
        const isActive = pathname === href;
        const className = cn(
          "flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors md:flex-none",
          isActive
            ? "bg-accent font-medium text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        );

        if (!available) {
          return (
            <span
              key={href}
              aria-disabled="true"
              title="Ainda não disponível"
              className={cn(className, "cursor-not-allowed opacity-40 hover:bg-transparent")}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </span>
          );
        }

        return (
          <Link key={href} href={href} className={className} aria-current={isActive ? "page" : undefined}>
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
