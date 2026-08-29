import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seed de desenvolvimento.
 *
 * Idempotente: pode rodar quantas vezes quiser. Cria o usuário apontado por
 * DEV_USER_EMAIL (usado pela sessão provisória) e, se ele ainda não tiver
 * nenhuma tarefa, algumas de exemplo para a Inbox não nascer vazia.
 */

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL não definida. Copie .env.example para .env.");
}

const email = process.env["DEV_USER_EMAIL"] ?? "dev@localhost";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SAMPLE_TASKS = [
  { title: "Revisar API", estimatedMinutes: 45, priority: "HIGH" },
  { title: "Ler capítulo", estimatedMinutes: 30, priority: "MEDIUM" },
  { title: "Estudar AEDS", estimatedMinutes: 90, priority: "HIGH" },
  { title: "Responder e-mails", estimatedMinutes: 10, priority: "LOW" },
] as const;

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Dev", timeZone: "America/Sao_Paulo" },
    select: { id: true, email: true },
  });

  console.log(`usuário pronto: ${user.email}`);

  const existingTasks = await prisma.task.count({ where: { userId: user.id } });
  if (existingTasks > 0) {
    console.log(`já existem ${existingTasks} tarefas — nada a semear`);
    return;
  }

  await prisma.task.createMany({
    data: SAMPLE_TASKS.map((task) => ({ ...task, userId: user.id })),
  });

  console.log(`${SAMPLE_TASKS.length} tarefas de exemplo criadas`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
