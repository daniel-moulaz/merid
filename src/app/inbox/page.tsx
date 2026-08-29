import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/auth/session";
import { formatMinutes, todayInTimeZone } from "@/lib/time";
import { getInboxTasks } from "@/modules/tasks/task-service";
import { QuickAddTaskForm } from "@/modules/tasks/ui/quick-add-task-form";
import { TaskList } from "@/modules/tasks/ui/task-list";

export const metadata: Metadata = { title: "Inbox" };

/**
 * Dados por usuário nunca são pré-renderizados no build nem compartilhados
 * entre sessões.
 */
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) return <SessionSetupNotice />;

  const { open, recentlyCompleted } = await getInboxTasks(user);

  // "Hoje" é calculado no servidor, no timezone do usuário — nunca no relógio
  // do navegador.
  const today = todayInTimeZone(user.timeZone);
  const plannedMinutes = open.reduce((total, task) => total + task.estimatedMinutes, 0);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {open.length === 0
            ? "Nada esperando para ser agendado."
            : `${open.length} ${open.length === 1 ? "tarefa" : "tarefas"} sem horário · ${formatMinutes(plannedMinutes)} estimados`}
        </p>
      </header>

      <QuickAddTaskForm />

      <section aria-label="Tarefas não agendadas">
        <TaskList
          tasks={open}
          today={today}
          emptyMessage="Sua Inbox está vazia. Cadastre a próxima coisa que precisa fazer."
        />
      </section>

      {recentlyCompleted.length > 0 ? (
        <section aria-label="Concluídas recentemente">
          <h2 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Concluídas
          </h2>
          <TaskList tasks={recentlyCompleted} today={today} />
        </section>
      ) : null}
    </div>
  );
}

/** Enquanto não há login, a sessão depende do seed + DEV_USER_EMAIL. */
function SessionSetupNotice() {
  return (
    <div className="rounded-lg border p-6">
      <h1 className="text-lg font-semibold">Nenhuma sessão encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        O login ainda não existe: em desenvolvimento o usuário vem de{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">DEV_USER_EMAIL</code>.
      </p>
      <ol className="mt-4 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
        <li>
          <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run db:up</code>
        </li>
        <li>
          <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run db:migrate</code>
        </li>
        <li>
          <code className="rounded bg-muted px-1 py-0.5 text-xs">npm run db:seed</code>
        </li>
        <li>
          Confira <code className="rounded bg-muted px-1 py-0.5 text-xs">DEV_USER_EMAIL</code> no
          arquivo <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>.
        </li>
      </ol>
    </div>
  );
}
