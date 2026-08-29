import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { SCHEDULE_BLOCK_WITH_TASK_COLUMNS } from "@/modules/schedule/data/schedule-mapper";

/**
 * Testes de RLS e de integridade de `schedule_blocks`, contra o Supabase local.
 *
 * Além do isolamento entre usuários (o mesmo que `tasks.rls.test.ts` prova para
 * as tarefas), aqui se prova a garantia específica desta tabela: um bloco NÃO
 * PODE apontar para uma tarefa de outro usuário. Essa é a invariante que a FK
 * composta `(task_id, user_id) -> tasks (id, user_id)` existe para sustentar.
 *
 * Nenhum teste usa a chave secreta (`service_role`): tudo passa pela mesma
 * chave publicável do aplicativo. Se passa aqui, é porque as policies e as
 * constraints funcionam — não porque o teste tinha privilégio.
 *
 * Requer `npm run db:start`.
 */

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"];
const supabaseKey = process.env["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Configure o .env a partir do .env.example antes de rodar os testes de RLS.");
}

type Client = SupabaseClient<Database>;

function createAnonymousClient(): Client {
  return createClient<Database>(supabaseUrl!, supabaseKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type TestUser = { readonly client: Client; readonly id: string };

async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID()}@teste.local`;
  const client = createAnonymousClient();

  const { data, error } = await client.auth.signUp({
    email,
    password: "senha-de-teste-123",
    options: { data: { display_name: label, time_zone: "America/Sao_Paulo" } },
  });

  if (error !== null) throw new Error(`falha ao criar usuário: ${error.message}`);
  if (data.user === null) throw new Error("cadastro não retornou usuário");

  return { client, id: data.user.id };
}

async function createTask(user: TestUser, title: string, estimatedMinutes = 60): Promise<string> {
  const { data, error } = await user.client
    .from("tasks")
    .insert({ title, estimated_minutes: estimatedMinutes })
    .select("id")
    .single();

  if (error !== null) throw new Error(`falha ao criar tarefa: ${error.message}`);
  return data.id;
}

/** Um instante determinístico deslocado em horas — evita colisão entre casos. */
function at(hoursFromBase: number): string {
  const BASE = Date.UTC(2026, 8, 1, 0, 0, 0);
  return new Date(BASE + hoursFromBase * 3_600_000).toISOString();
}

async function createBlock(
  user: TestUser,
  taskId: string,
  startHour: number,
  endHour: number,
): Promise<string> {
  const { data, error } = await user.client
    .from("schedule_blocks")
    .insert({ task_id: taskId, starts_at: at(startHour), ends_at: at(endHour) })
    .select("id")
    .single();

  if (error !== null) throw new Error(`falha ao criar bloco: ${error.message}`);
  return data.id;
}

let alice: TestUser;
let bob: TestUser;
let aliceTaskId: string;
let bobTaskId: string;
let aliceBlockId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser("alice"), createUser("bob")]);
  [aliceTaskId, bobTaskId] = await Promise.all([
    createTask(alice, "Estudar AEDS", 90),
    createTask(bob, "Tarefa do Bob", 30),
  ]);
  aliceBlockId = await createBlock(alice, aliceTaskId, 14, 15.5);
});

describe("o dono é atribuído pelo servidor", () => {
  it("grava o user_id do JWT sem o cliente enviá-lo", async () => {
    const { data, error } = await alice.client
      .from("schedule_blocks")
      .select("user_id, task_id")
      .eq("id", aliceBlockId)
      .single();

    expect(error).toBeNull();
    expect(data?.user_id).toBe(alice.id);
    expect(data?.task_id).toBe(aliceTaskId);
  });

  it("recusa user_id forjado no payload", async () => {
    const { error } = await bob.client.from("schedule_blocks").insert({
      task_id: bobTaskId,
      starts_at: at(20),
      ends_at: at(21),
      user_id: alice.id,
    });

    expect(error).not.toBeNull();
    // A policy de INSERT (`with check auth.uid() = user_id`) recusa a linha.
    expect(error?.code).toBe("42501");
  });
});

describe("isolamento entre usuários", () => {
  it("cada usuário lista apenas os próprios blocos", async () => {
    await createBlock(bob, bobTaskId, 10, 11);

    const fromAlice = await alice.client.from("schedule_blocks").select("id");
    const fromBob = await bob.client.from("schedule_blocks").select("id");

    expect(fromAlice.error).toBeNull();
    expect(fromBob.error).toBeNull();
    expect(fromAlice.data?.map((row) => row.id)).toContain(aliceBlockId);
    expect(fromBob.data?.map((row) => row.id)).not.toContain(aliceBlockId);
  });

  it("buscar pelo id do bloco alheio não devolve nada", async () => {
    const { data, error } = await bob.client
      .from("schedule_blocks")
      .select("*")
      .eq("id", aliceBlockId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("UPDATE em bloco alheio não altera nada", async () => {
    const attempt = await bob.client
      .from("schedule_blocks")
      .update({ starts_at: at(3), ends_at: at(4) })
      .eq("id", aliceBlockId)
      .select();

    expect(attempt.error).toBeNull();
    expect(attempt.data).toEqual([]);

    const { data } = await alice.client
      .from("schedule_blocks")
      .select("starts_at")
      .eq("id", aliceBlockId)
      .single();
    expect(data?.starts_at).not.toBeNull();
    expect(new Date(data!.starts_at).toISOString()).toBe(at(14));
  });

  it("DELETE em bloco alheio não apaga nada", async () => {
    const attempt = await bob.client
      .from("schedule_blocks")
      .delete()
      .eq("id", aliceBlockId)
      .select();

    expect(attempt.error).toBeNull();
    expect(attempt.data).toEqual([]);

    const { count } = await alice.client
      .from("schedule_blocks")
      .select("*", { count: "exact", head: true })
      .eq("id", aliceBlockId);
    expect(count).toBe(1);
  });
});

describe("um bloco não pode apontar para tarefa de outro usuário", () => {
  it("recusa criar bloco para a tarefa da Alice", async () => {
    // O `user_id` gravado será o do Bob (default auth.uid()), então o par
    // (task_id da Alice, user_id do Bob) não existe em `tasks` e a FK composta
    // recusa a linha.
    const { error } = await bob.client
      .from("schedule_blocks")
      .insert({ task_id: aliceTaskId, starts_at: at(30), ends_at: at(31) });

    expect(error).not.toBeNull();
    // 23503 = foreign_key_violation.
    expect(error?.code).toBe("23503");
    expect(error?.message).toContain("schedule_blocks_task_belongs_to_owner");
  });

  it("recusa mesmo forjando o user_id junto", async () => {
    // Enviar os dois campos coerentes com a Alice satisfaria a FK, mas a policy
    // de INSERT recusa antes: o `user_id` precisa ser o do próprio JWT.
    const { error } = await bob.client.from("schedule_blocks").insert({
      task_id: aliceTaskId,
      user_id: alice.id,
      starts_at: at(32),
      ends_at: at(33),
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("recusa apontar para uma tarefa inexistente", async () => {
    const { error } = await alice.client.from("schedule_blocks").insert({
      task_id: crypto.randomUUID(),
      starts_at: at(34),
      ends_at: at(35),
    });

    expect(error?.code).toBe("23503");
  });

  it("recusa mover um bloco próprio para a tarefa de outro usuário", async () => {
    const { error } = await alice.client
      .from("schedule_blocks")
      .update({ task_id: bobTaskId })
      .eq("id", aliceBlockId);

    expect(error?.code).toBe("23503");
  });
});

describe("acesso anônimo", () => {
  const anonymous = createAnonymousClient();

  it("não lê bloco nenhum", async () => {
    const { data, error } = await anonymous.from("schedule_blocks").select("*");

    expect(data ?? []).toEqual([]);
    if (error !== null) expect(error.code).toBeDefined();
  });

  it("não consegue inserir", async () => {
    const { error } = await anonymous
      .from("schedule_blocks")
      .insert({ task_id: aliceTaskId, starts_at: at(40), ends_at: at(41) });

    expect(error).not.toBeNull();
  });

  it("não consegue apagar", async () => {
    const { error, data } = await anonymous
      .from("schedule_blocks")
      .delete()
      .eq("id", aliceBlockId)
      .select();

    expect(data ?? []).toEqual([]);
    if (error !== null) expect(error.code).toBeDefined();

    const { count } = await alice.client
      .from("schedule_blocks")
      .select("*", { count: "exact", head: true })
      .eq("id", aliceBlockId);
    expect(count).toBe(1);
  });
});

describe("invariantes de intervalo aplicadas pelo banco", () => {
  it("recusa fim igual ao início", async () => {
    const { error } = await alice.client
      .from("schedule_blocks")
      .insert({ task_id: aliceTaskId, starts_at: at(50), ends_at: at(50) });

    expect(error?.message).toContain("schedule_blocks_ends_after_starts");
  });

  it("recusa fim antes do início", async () => {
    const { error } = await alice.client
      .from("schedule_blocks")
      .insert({ task_id: aliceTaskId, starts_at: at(52), ends_at: at(51) });

    expect(error?.message).toContain("schedule_blocks_ends_after_starts");
  });

  it("recusa inverter o intervalo em um UPDATE", async () => {
    const { error } = await alice.client
      .from("schedule_blocks")
      .update({ ends_at: at(13) })
      .eq("id", aliceBlockId);

    expect(error?.message).toContain("schedule_blocks_ends_after_starts");
  });

  it("recusa bloco com mais de 24 horas", async () => {
    const { error } = await alice.client
      .from("schedule_blocks")
      .insert({ task_id: aliceTaskId, starts_at: at(60), ends_at: at(85) });

    expect(error?.message).toContain("schedule_blocks_max_duration");
  });

  it("aceita bloco que atravessa a meia-noite", async () => {
    const { error } = await alice.client
      .from("schedule_blocks")
      .insert({ task_id: aliceTaskId, starts_at: at(23), ends_at: at(25) });

    expect(error).toBeNull();
  });

  it("aceita dois blocos SOBREPOSTOS — conflito é decisão do usuário, não do banco", async () => {
    const taskId = await createTask(alice, "Sobreposição intencional");

    const first = await alice.client
      .from("schedule_blocks")
      .insert({ task_id: taskId, starts_at: at(100), ends_at: at(102) });
    const second = await alice.client
      .from("schedule_blocks")
      .insert({ task_id: taskId, starts_at: at(101), ends_at: at(103) });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
  });

  it("aceita blocos encostados — [início, fim) não conflita na borda", async () => {
    const taskId = await createTask(alice, "Blocos encostados");

    const first = await alice.client
      .from("schedule_blocks")
      .insert({ task_id: taskId, starts_at: at(110), ends_at: at(111) });
    const second = await alice.client
      .from("schedule_blocks")
      .insert({ task_id: taskId, starts_at: at(111), ends_at: at(112) });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
  });
});

describe("Task e ScheduleBlock são entidades independentes", () => {
  it("uma tarefa pode ter VÁRIOS blocos", async () => {
    const taskId = await createTask(alice, "Dividida em sessões", 180);
    await createBlock(alice, taskId, 200, 201);
    await createBlock(alice, taskId, 210, 211);

    const { data } = await alice.client
      .from("schedule_blocks")
      .select("id")
      .eq("task_id", taskId);

    expect(data).toHaveLength(2);
  });

  it("REMOVER DA AGENDA apaga o bloco e mantém a tarefa aberta", async () => {
    const taskId = await createTask(alice, "Volta para não agendadas");
    const blockId = await createBlock(alice, taskId, 220, 221);

    const removed = await alice.client.from("schedule_blocks").delete().eq("id", blockId);
    expect(removed.error).toBeNull();

    const { data } = await alice.client
      .from("tasks")
      .select("id, status")
      .eq("id", taskId)
      .single();

    expect(data?.id).toBe(taskId);
    expect(data?.status).toBe("TODO");
  });

  it("CONCLUIR a tarefa mantém o bloco na agenda", async () => {
    const taskId = await createTask(alice, "Concluída pela agenda");
    const blockId = await createBlock(alice, taskId, 230, 231);

    const completed = await alice.client
      .from("tasks")
      .update({ status: "DONE" })
      .eq("id", taskId)
      .select("status, completed_at")
      .single();

    expect(completed.data?.status).toBe("DONE");
    expect(completed.data?.completed_at).not.toBeNull();

    const { count } = await alice.client
      .from("schedule_blocks")
      .select("*", { count: "exact", head: true })
      .eq("id", blockId);
    expect(count).toBe(1);
  });

  it("a duração do bloco pode divergir da estimativa da tarefa", async () => {
    // Tarefa estimada em 90 min, bloco de 60: permitido de propósito (R4).
    const taskId = await createTask(alice, "Estimativa maior que o bloco", 90);
    await createBlock(alice, taskId, 240, 241);

    const { data } = await alice.client
      .from("tasks")
      .select("estimated_minutes")
      .eq("id", taskId)
      .single();

    // Agendar não altera a estimativa.
    expect(data?.estimated_minutes).toBe(90);
  });

  it("EXCLUIR a tarefa leva os blocos junto (cascade)", async () => {
    const taskId = await createTask(alice, "Excluída de vez");
    const blockId = await createBlock(alice, taskId, 250, 251);

    const removed = await alice.client.from("tasks").delete().eq("id", taskId);
    expect(removed.error).toBeNull();

    const { count } = await alice.client
      .from("schedule_blocks")
      .select("*", { count: "exact", head: true })
      .eq("id", blockId);
    expect(count).toBe(0);
  });
});

describe("consulta da tela Hoje", () => {
  it("traz bloco e tarefa em uma única requisição, sem N+1", async () => {
    // A MESMA string que o repositório usa: se o nome da constraint mudar na
    // migration e o mapper não acompanhar, este teste quebra aqui e não em
    // produção.
    const { data, error } = await alice.client
      .from("schedule_blocks")
      .select(SCHEDULE_BLOCK_WITH_TASK_COLUMNS)
      .eq("id", aliceBlockId)
      .single();

    expect(error).toBeNull();
    expect(data?.task).not.toBeNull();
    expect(data?.task?.title).toBe("Estudar AEDS");
    expect(data?.task?.estimated_minutes).toBe(90);
    // O prazo atravessa a rede como data civil, nunca como instante.
    expect(data?.task?.due_date).toBeNull();
  });

  it("o embed não vaza a tarefa de outro usuário", async () => {
    const { data, error } = await bob.client
      .from("schedule_blocks")
      .select(SCHEDULE_BLOCK_WITH_TASK_COLUMNS)
      .eq("id", aliceBlockId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("o filtro de interseção pega o bloco que atravessa a fronteira do dia", async () => {
    const taskId = await createTask(alice, "Vira o dia");
    // 23:00 -> 01:00 do dia seguinte, em instantes.
    await createBlock(alice, taskId, 23, 25);

    // Intervalo do dia SEGUINTE: [24h, 48h).
    const { data, error } = await alice.client
      .from("schedule_blocks")
      .select("id")
      .lt("starts_at", at(48))
      .gt("ends_at", at(24))
      .eq("task_id", taskId);

    expect(error).toBeNull();
    // Começou no dia anterior, mas invade o dia seguinte: precisa aparecer.
    expect(data).toHaveLength(1);
  });
});
