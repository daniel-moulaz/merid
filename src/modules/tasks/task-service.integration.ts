import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

import { createTask, getInboxTasks, setTaskCompletion, updateTask } from "./task-service";

/**
 * Fatia vertical contra um Postgres real: criar -> Inbox -> concluir -> reabrir.
 *
 * Também verifica que as invariantes escritas na migration realmente rejeitam
 * dados inconsistentes — elas são a última linha de defesa e precisam ser
 * testadas no banco, não só no aplicativo.
 */

async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "reminders", "schedule_blocks", "tasks", "projects", "users" CASCADE',
  );
}

async function createUser(email: string): Promise<SessionUser> {
  return prisma.user.create({
    data: { email, name: "Teste", timeZone: "America/Sao_Paulo" },
    select: { id: true, email: true, name: true, timeZone: true },
  });
}

const BASE_INPUT = {
  title: "Estudar AEDS",
  description: null,
  estimatedMinutes: 90,
  priority: "HIGH",
  dueDate: "2026-09-01",
  projectId: null,
} as const;

beforeEach(resetDatabase);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("ciclo de vida da tarefa", () => {
  it("cria, aparece na Inbox, conclui e reabre", async () => {
    const user = await createUser("ciclo@teste.local");

    const created = await createTask(user, BASE_INPUT);
    expect(created.status).toBe("TODO");
    expect(created.completedAt).toBeNull();
    expect(created.estimatedMinutes).toBe(90);

    const afterCreate = await getInboxTasks(user);
    expect(afterCreate.open.map((task) => task.id)).toEqual([created.id]);
    expect(afterCreate.recentlyCompleted).toHaveLength(0);

    const completedAt = new Date("2026-08-29T17:00:00.000Z");
    const completed = await setTaskCompletion(
      user,
      { id: created.id, completed: true },
      completedAt,
    );
    expect(completed.status).toBe("DONE");
    expect(completed.completedAt).toEqual(completedAt);

    const afterComplete = await getInboxTasks(user);
    expect(afterComplete.open).toHaveLength(0);
    expect(afterComplete.recentlyCompleted.map((task) => task.id)).toEqual([created.id]);

    const reopened = await setTaskCompletion(user, { id: created.id, completed: false });
    expect(reopened.status).toBe("TODO");
    expect(reopened.completedAt).toBeNull();

    const afterReopen = await getInboxTasks(user);
    expect(afterReopen.open.map((task) => task.id)).toEqual([created.id]);
    expect(afterReopen.recentlyCompleted).toHaveLength(0);
  });

  it("persiste o prazo como DIA, sem deslocamento por timezone", async () => {
    const user = await createUser("prazo@teste.local");

    const created = await createTask(user, { ...BASE_INPUT, dueDate: "2026-09-01" });
    expect(created.dueDate).toBe("2026-09-01");

    // Releitura em um processo cujo TZ local é UTC+14: o dia não pode mudar.
    const reloaded = await getInboxTasks(user);
    expect(reloaded.open[0]?.dueDate).toBe("2026-09-01");

    // E o que está gravado na coluna `date` também é o dia correto.
    const raw = await prisma.$queryRawUnsafe<{ due_date: string }[]>(
      "SELECT to_char(due_date, 'YYYY-MM-DD') AS due_date FROM \"tasks\" WHERE id = $1::uuid",
      created.id,
    );
    expect(raw[0]?.due_date).toBe("2026-09-01");
  });

  it("edita mantendo a mesma tarefa", async () => {
    const user = await createUser("edicao@teste.local");
    const created = await createTask(user, BASE_INPUT);

    const updated = await updateTask(user, {
      id: created.id,
      title: "Estudar AEDS — revisão",
      description: "capítulos 3 e 4",
      estimatedMinutes: 45,
      priority: "URGENT",
      dueDate: null,
      projectId: null,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe("Estudar AEDS — revisão");
    expect(updated.estimatedMinutes).toBe(45);
    expect(updated.dueDate).toBeNull();
    expect(await prisma.task.count()).toBe(1);
  });

  it("ordena a Inbox por prioridade e depois por prazo", async () => {
    const user = await createUser("ordem@teste.local");

    await createTask(user, { ...BASE_INPUT, title: "baixa", priority: "LOW", dueDate: null });
    await createTask(user, { ...BASE_INPUT, title: "urgente", priority: "URGENT", dueDate: null });
    await createTask(user, {
      ...BASE_INPUT,
      title: "alta sem prazo",
      priority: "HIGH",
      dueDate: null,
    });
    await createTask(user, {
      ...BASE_INPUT,
      title: "alta com prazo",
      priority: "HIGH",
      dueDate: "2026-01-01",
    });

    const { open } = await getInboxTasks(user);
    expect(open.map((task) => task.title)).toEqual([
      "urgente",
      "alta com prazo",
      "alta sem prazo",
      "baixa",
    ]);
  });
});

describe("isolamento entre usuários", () => {
  it("a Inbox só enxerga as tarefas do próprio usuário", async () => {
    const owner = await createUser("dono@teste.local");
    const other = await createUser("outro@teste.local");

    await createTask(owner, BASE_INPUT);

    expect((await getInboxTasks(owner)).open).toHaveLength(1);
    expect((await getInboxTasks(other)).open).toHaveLength(0);
  });

  it("não deixa outro usuário concluir tarefa alheia", async () => {
    const owner = await createUser("dono2@teste.local");
    const attacker = await createUser("invasor@teste.local");
    const task = await createTask(owner, BASE_INPUT);

    await expect(setTaskCompletion(attacker, { id: task.id, completed: true })).rejects.toThrow(
      AppError,
    );

    const untouched = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(untouched.status).toBe("TODO");
  });

  it("não deixa outro usuário editar tarefa alheia", async () => {
    const owner = await createUser("dono3@teste.local");
    const attacker = await createUser("invasor3@teste.local");
    const task = await createTask(owner, BASE_INPUT);

    await expect(
      updateTask(attacker, { ...BASE_INPUT, id: task.id, title: "sequestrada" }),
    ).rejects.toThrow(AppError);

    const untouched = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(untouched.title).toBe(BASE_INPUT.title);
  });

  it("recusa vincular a tarefa a um projeto de outro usuário", async () => {
    const owner = await createUser("dono4@teste.local");
    const other = await createUser("outro4@teste.local");
    const foreignProject = await prisma.project.create({
      data: { userId: other.id, name: "Projeto alheio" },
      select: { id: true },
    });

    await expect(
      createTask(owner, { ...BASE_INPUT, projectId: foreignProject.id }),
    ).rejects.toThrow(AppError);
  });
});

describe("Task e ScheduleBlock são entidades separadas", () => {
  it("uma tarefa com bloco de agenda sai da Inbox sem deixar de existir", async () => {
    const user = await createUser("agenda@teste.local");
    const task = await createTask(user, BASE_INPUT);

    await prisma.scheduleBlock.create({
      data: {
        userId: user.id,
        taskId: task.id,
        startsAt: new Date("2026-09-01T17:00:00.000Z"),
        endsAt: new Date("2026-09-01T18:30:00.000Z"),
      },
    });

    expect((await getInboxTasks(user)).open).toHaveLength(0);
    expect(await prisma.task.count({ where: { userId: user.id } })).toBe(1);

    // Reagendar é mexer no bloco; a tarefa continua a mesma.
    await prisma.scheduleBlock.updateMany({
      where: { taskId: task.id },
      data: {
        startsAt: new Date("2026-09-02T17:00:00.000Z"),
        endsAt: new Date("2026-09-02T18:30:00.000Z"),
      },
    });

    const unchanged = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.title).toBe(BASE_INPUT.title);
  });

  it("apagar a tarefa leva os blocos junto", async () => {
    const user = await createUser("cascata@teste.local");
    const task = await createTask(user, BASE_INPUT);

    await prisma.scheduleBlock.create({
      data: {
        userId: user.id,
        taskId: task.id,
        startsAt: new Date("2026-09-01T17:00:00.000Z"),
        endsAt: new Date("2026-09-01T18:30:00.000Z"),
      },
    });

    await prisma.task.delete({ where: { id: task.id } });
    expect(await prisma.scheduleBlock.count()).toBe(0);
  });
});

describe("invariantes aplicadas pelo banco", () => {
  it("recusa status DONE sem completedAt", async () => {
    const user = await createUser("check1@teste.local");
    const task = await createTask(user, BASE_INPUT);

    await expect(
      prisma.$executeRawUnsafe(
        "UPDATE \"tasks\" SET status = 'DONE' WHERE id = $1::uuid",
        task.id,
      ),
    ).rejects.toThrow(/tasks_status_matches_completed_at/);
  });

  it("recusa duração estimada fora do intervalo", async () => {
    const user = await createUser("check2@teste.local");

    await expect(
      prisma.task.create({
        data: { userId: user.id, title: "impossível", estimatedMinutes: 0 },
      }),
    ).rejects.toThrow(/tasks_estimated_minutes_range/);
  });

  it("recusa título em branco", async () => {
    const user = await createUser("check3@teste.local");

    await expect(
      prisma.task.create({
        data: { userId: user.id, title: "   ", estimatedMinutes: 30 },
      }),
    ).rejects.toThrow(/tasks_title_not_blank/);
  });

  it("recusa bloco de agenda que termina antes de começar", async () => {
    const user = await createUser("check4@teste.local");
    const task = await createTask(user, BASE_INPUT);

    await expect(
      prisma.scheduleBlock.create({
        data: {
          userId: user.id,
          taskId: task.id,
          startsAt: new Date("2026-09-01T18:00:00.000Z"),
          endsAt: new Date("2026-09-01T17:00:00.000Z"),
        },
      }),
    ).rejects.toThrow(/schedule_blocks_positive_duration/);
  });

  it("recusa bloco apontando para a tarefa de outro usuário", async () => {
    const owner = await createUser("check5@teste.local");
    const other = await createUser("check5b@teste.local");
    const task = await createTask(owner, BASE_INPUT);

    await expect(
      prisma.scheduleBlock.create({
        data: {
          userId: other.id,
          taskId: task.id,
          startsAt: new Date("2026-09-01T17:00:00.000Z"),
          endsAt: new Date("2026-09-01T18:00:00.000Z"),
        },
      }),
    ).rejects.toThrow(/schedule_blocks_task_id_user_id_fkey/);
  });

  it("recusa lembrete sem alvo e lembrete com dois alvos", async () => {
    const user = await createUser("check6@teste.local");
    const task = await createTask(user, BASE_INPUT);
    const block = await prisma.scheduleBlock.create({
      data: {
        userId: user.id,
        taskId: task.id,
        startsAt: new Date("2026-09-01T17:00:00.000Z"),
        endsAt: new Date("2026-09-01T18:00:00.000Z"),
      },
      select: { id: true },
    });

    await expect(
      prisma.reminder.create({
        data: { userId: user.id, remindAt: new Date("2026-09-01T16:45:00.000Z") },
      }),
    ).rejects.toThrow(/reminders_exactly_one_target/);

    await expect(
      prisma.reminder.create({
        data: {
          userId: user.id,
          taskId: task.id,
          scheduleBlockId: block.id,
          remindAt: new Date("2026-09-01T16:45:00.000Z"),
        },
      }),
    ).rejects.toThrow(/reminders_exactly_one_target/);

    // Com exatamente um alvo, passa.
    const valid = await prisma.reminder.create({
      data: {
        userId: user.id,
        scheduleBlockId: block.id,
        remindAt: new Date("2026-09-01T16:45:00.000Z"),
      },
      select: { id: true, status: true },
    });
    expect(valid.status).toBe("PENDING");
  });
});
