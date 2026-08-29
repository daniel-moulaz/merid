-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('TODO', 'DONE');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "reminder_status" AS ENUM ('PENDING', 'SENT', 'DISMISSED', 'CANCELED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "time_zone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimated_minutes" INTEGER NOT NULL,
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "due_date" DATE,
    "status" "task_status" NOT NULL DEFAULT 'TODO',
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_blocks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID,
    "schedule_block_id" UUID,
    "remind_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "reminder_status" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE INDEX "tasks_user_id_status_created_at_idx" ON "tasks"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "tasks_user_id_due_date_idx" ON "tasks"("user_id", "due_date");

-- CreateIndex
CREATE INDEX "tasks_user_id_project_id_idx" ON "tasks"("user_id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_id_user_id_key" ON "tasks"("id", "user_id");

-- CreateIndex
CREATE INDEX "schedule_blocks_user_id_starts_at_idx" ON "schedule_blocks"("user_id", "starts_at");

-- CreateIndex
CREATE INDEX "schedule_blocks_task_id_idx" ON "schedule_blocks"("task_id");

-- CreateIndex
CREATE INDEX "reminders_status_remind_at_idx" ON "reminders"("status", "remind_at");

-- CreateIndex
CREATE INDEX "reminders_user_id_remind_at_idx" ON "reminders"("user_id", "remind_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_blocks" ADD CONSTRAINT "schedule_blocks_task_id_user_id_fkey" FOREIGN KEY ("task_id", "user_id") REFERENCES "tasks"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_schedule_block_id_fkey" FOREIGN KEY ("schedule_block_id") REFERENCES "schedule_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes de domínio aplicadas no banco (escritas à mão).
-- O banco é a última linha de defesa: nenhuma delas depende do app.
-- ---------------------------------------------------------------------------

-- Título não pode ser vazio nem só espaços.
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_title_not_blank"
  CHECK (length(btrim("title")) > 0);

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_name_not_blank"
  CHECK (length(btrim("name")) > 0);

-- Duração estimada: entre 1 minuto e 24 horas.
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_estimated_minutes_range"
  CHECK ("estimated_minutes" >= 1 AND "estimated_minutes" <= 1440);

-- status e completed_at nunca podem divergir.
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_status_matches_completed_at"
  CHECK (("status" = 'DONE') = ("completed_at" IS NOT NULL));

-- Bloco de agenda precisa ter duração positiva. Combinado com o intervalo
-- semiaberto [starts_at, endsAt), isso impede blocos de duração zero.
ALTER TABLE "schedule_blocks"
  ADD CONSTRAINT "schedule_blocks_positive_duration"
  CHECK ("ends_at" > "starts_at");

-- Lembrete pertence a EXATAMENTE um alvo: a tarefa (prazo) ou o bloco (execução).
ALTER TABLE "reminders"
  ADD CONSTRAINT "reminders_exactly_one_target"
  CHECK (num_nonnulls("task_id", "schedule_block_id") = 1);
