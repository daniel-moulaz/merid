import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Testes de RLS da função `daily_activity`.
 *
 * Uma função agregadora é exatamente o lugar onde um vazamento passaria
 * despercebido: ela não devolve linhas de outra pessoa, devolve SOMAS — e uma
 * soma contaminada não parece dado alheio, parece um número um pouco maior.
 * Por isso os casos abaixo verificam o total, e não só a ausência de linhas.
 *
 * Como nos demais, nenhuma chave secreta é usada: se passa, é porque a função
 * é `security invoker` e a policy de `tasks` realmente se aplica.
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
  const client = createAnonymousClient();
  const { data, error } = await client.auth.signUp({
    email: `${label}-${crypto.randomUUID()}@teste.local`,
    password: "senha-de-teste-123",
    options: { data: { display_name: label, time_zone: "America/Sao_Paulo" } },
  });

  if (error !== null) throw new Error(`falha ao criar usuário: ${error.message}`);
  if (data.user === null) throw new Error("cadastro não retornou usuário");

  return { client, id: data.user.id };
}

/** Cria a tarefa e a conclui, deixando o trigger gravar `completed_at`. */
async function completeTask(user: TestUser, minutes: number): Promise<void> {
  const created = await user.client
    .from("tasks")
    .insert({ title: `Tarefa de ${minutes} min`, estimated_minutes: minutes })
    .select("id")
    .single();

  if (created.error !== null) throw new Error(`falha ao criar: ${created.error.message}`);

  const done = await user.client
    .from("tasks")
    .update({ status: "DONE" })
    .eq("id", created.data.id);

  if (done.error !== null) throw new Error(`falha ao concluir: ${done.error.message}`);
}

const TZ = "America/Sao_Paulo";

/** Janela larga o bastante para conter tudo o que a suíte cria agora. */
function wideRange(): { p_from: string; p_to: string; p_time_zone: string } {
  const now = Date.now();
  return {
    p_from: new Date(now - 7 * 86_400_000).toISOString(),
    p_to: new Date(now + 7 * 86_400_000).toISOString(),
    p_time_zone: TZ,
  };
}

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser("alice"), createUser("bob")]);

  // Alice: 30 + 90 = 120 min em 2 tarefas. Bob: 45 min em 1.
  await completeTask(alice, 30);
  await completeTask(alice, 90);
  await completeTask(bob, 45);
});

describe("isolamento", () => {
  it("cada usuário agrega apenas as próprias conclusões", async () => {
    const fromAlice = await alice.client.rpc("daily_activity", wideRange());
    const fromBob = await bob.client.rpc("daily_activity", wideRange());

    expect(fromAlice.error).toBeNull();
    expect(fromBob.error).toBeNull();

    const aliceMinutes = (fromAlice.data ?? []).reduce((sum, row) => sum + row.minutes, 0);
    const bobMinutes = (fromBob.data ?? []).reduce((sum, row) => sum + row.minutes, 0);

    // Se a função rodasse com privilégio elevado, os dois veriam 165.
    expect(aliceMinutes).toBe(120);
    expect(bobMinutes).toBe(45);
  });

  it("a contagem de tarefas também é isolada", async () => {
    const { data } = await alice.client.rpc("daily_activity", wideRange());
    const tasks = (data ?? []).reduce((sum, row) => sum + row.tasks, 0);

    expect(tasks).toBe(2);
  });

  it("usuário anônimo não consegue executar a função", async () => {
    const anonymous = createAnonymousClient();
    const { error } = await anonymous.rpc("daily_activity", wideRange());

    expect(error).not.toBeNull();
  });

  it("um usuário novo, sem conclusões, recebe lista vazia e não erro", async () => {
    const carol = await createUser("carol");
    const { data, error } = await carol.client.rpc("daily_activity", wideRange());

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("agregação", () => {
  it("soma as tarefas do mesmo dia em uma única linha", async () => {
    const { data } = await alice.client.rpc("daily_activity", wideRange());

    // As duas conclusões da Alice aconteceram no mesmo instante de teste.
    expect(data).toHaveLength(1);
    expect(data?.at(0)).toMatchObject({ minutes: 120, tasks: 2 });
  });

  it("devolve o dia como AAAA-MM-DD, sem horário", async () => {
    const { data } = await alice.client.rpc("daily_activity", wideRange());

    expect(data?.at(0)?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("tarefa ainda aberta não entra na agregação", async () => {
    const dave = await createUser("dave");
    await dave.client.from("tasks").insert({ title: "Aberta", estimated_minutes: 120 });

    const { data } = await dave.client.rpc("daily_activity", wideRange());
    expect(data).toEqual([]);
  });

  it("reabrir a tarefa retira a atividade do dia", async () => {
    const erin = await createUser("erin");
    await completeTask(erin, 60);

    const before = await erin.client.rpc("daily_activity", wideRange());
    expect(before.data).toHaveLength(1);

    // O trigger limpa `completed_at`, então a conclusão some do histórico —
    // é o trade-off assumido para a V1, e este caso o mantém honesto.
    await erin.client.from("tasks").update({ status: "TODO" }).eq("status", "DONE");

    const after = await erin.client.rpc("daily_activity", wideRange());
    expect(after.data).toEqual([]);
  });

  it("o intervalo é semiaberto: nada fora dele entra", async () => {
    const past = {
      p_from: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      p_to: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      p_time_zone: TZ,
    };

    const { data, error } = await alice.client.rpc("daily_activity", past);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("o fuso informado decide a qual dia a conclusão pertence", async () => {
    // O mesmo instante lido em Kiritimati (UTC+14) e em Honolulu (UTC-10)
    // pode cair em dias civis diferentes — 24 h separam os dois extremos.
    const range = wideRange();

    const [east, west] = await Promise.all([
      alice.client.rpc("daily_activity", { ...range, p_time_zone: "Pacific/Kiritimati" }),
      alice.client.rpc("daily_activity", { ...range, p_time_zone: "Pacific/Honolulu" }),
    ]);

    expect(east.error).toBeNull();
    expect(west.error).toBeNull();

    // O total nunca muda com o fuso; só o rótulo do dia pode mudar.
    const total = (rows: { minutes: number }[] | null) =>
      (rows ?? []).reduce((sum, row) => sum + row.minutes, 0);

    expect(total(east.data)).toBe(120);
    expect(total(west.data)).toBe(120);
  });
});
