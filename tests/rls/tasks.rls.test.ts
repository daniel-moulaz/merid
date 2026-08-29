import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Testes de RLS contra o Supabase local.
 *
 * São os testes mais importantes desta arquitetura. Sem servidor próprio, o
 * isolamento entre usuários não é garantido por código do aplicativo — é
 * garantido pelo Postgres. Estes casos provam isso do lado de fora, usando
 * exatamente a mesma chave publicável que o app usa.
 *
 * A chave secreta (`service_role`) NÃO é usada em lugar nenhum: se estes
 * testes passam, é porque as policies realmente funcionam, e não porque o
 * teste tinha privilégio para contorná-las.
 *
 * Requer `npm run db:start`.
 */

const supabaseUrl = process.env["EXPO_PUBLIC_SUPABASE_URL"];
const supabaseKey = process.env["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Configure o .env a partir do .env.example antes de rodar os testes de RLS.");
}

type Client = SupabaseClient<Database>;

/** Cliente sem sessão: opera como o papel `anon`. */
function createAnonymousClient(): Client {
  return createClient<Database>(supabaseUrl!, supabaseKey!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type TestUser = { readonly client: Client; readonly id: string; readonly email: string };

/** E-mail único por execução: os testes não dependem de limpeza prévia. */
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

  return { client, id: data.user.id, email };
}

async function createTask(user: TestUser, title: string, estimatedMinutes = 30): Promise<string> {
  const { data, error } = await user.client
    .from("tasks")
    .insert({ title, estimated_minutes: estimatedMinutes })
    .select("id")
    .single();

  if (error !== null) throw new Error(`falha ao criar tarefa: ${error.message}`);
  return data.id;
}

let alice: TestUser;
let bob: TestUser;
let aliceTaskId: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser("alice"), createUser("bob")]);
  aliceTaskId = await createTask(alice, "Tarefa da Alice", 90);
  await createTask(bob, "Tarefa do Bob", 45);
});

describe("isolamento entre usuários", () => {
  it("cada usuário lista apenas as próprias tarefas", async () => {
    const fromAlice = await alice.client.from("tasks").select("title");
    const fromBob = await bob.client.from("tasks").select("title");

    expect(fromAlice.error).toBeNull();
    expect(fromBob.error).toBeNull();
    expect(fromAlice.data?.map((task) => task.title)).toEqual(["Tarefa da Alice"]);
    expect(fromBob.data?.map((task) => task.title)).toEqual(["Tarefa do Bob"]);
  });

  it("buscar pelo id da tarefa alheia não devolve nada", async () => {
    const { data, error } = await bob.client.from("tasks").select("*").eq("id", aliceTaskId);

    expect(error).toBeNull();
    // A linha existe, mas para o Bob é como se não existisse.
    expect(data).toEqual([]);
  });

  it("UPDATE em tarefa alheia não altera nada", async () => {
    const attempt = await bob.client
      .from("tasks")
      .update({ title: "sequestrada" })
      .eq("id", aliceTaskId)
      .select();

    expect(attempt.error).toBeNull();
    expect(attempt.data).toEqual([]);

    const { data } = await alice.client.from("tasks").select("title").eq("id", aliceTaskId).single();
    expect(data?.title).toBe("Tarefa da Alice");
  });

  it("DELETE em tarefa alheia não apaga nada", async () => {
    const attempt = await bob.client.from("tasks").delete().eq("id", aliceTaskId).select();

    expect(attempt.error).toBeNull();
    expect(attempt.data).toEqual([]);

    const { count } = await alice.client
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("id", aliceTaskId);
    expect(count).toBe(1);
  });

  it("INSERT com user_id forjado é recusado pelo banco", async () => {
    // Mesmo enviando o id da Alice explicitamente no payload, a policy
    // `with check (auth.uid() = user_id)` recusa a linha.
    const { error } = await bob.client
      .from("tasks")
      .insert({ title: "plantada", estimated_minutes: 10, user_id: alice.id });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");

    const { data } = await alice.client.from("tasks").select("title");
    expect(data?.map((task) => task.title)).not.toContain("plantada");
  });

  it("o dono é atribuído pelo servidor quando o cliente não envia user_id", async () => {
    const id = await createTask(bob, "Sem dono explícito");

    const { data } = await bob.client.from("tasks").select("user_id").eq("id", id).single();
    expect(data?.user_id).toBe(bob.id);
  });
});

describe("acesso anônimo", () => {
  const anonymous = createAnonymousClient();

  it("não lê tarefa nenhuma", async () => {
    const { data, error } = await anonymous.from("tasks").select("*");

    // Sem JWT o papel é `anon`, que não tem policy nem grant.
    expect(data ?? []).toEqual([]);
    if (error !== null) expect(error.code).toBeDefined();
  });

  it("não consegue inserir", async () => {
    const { error } = await anonymous
      .from("tasks")
      .insert({ title: "anônima", estimated_minutes: 10 });

    expect(error).not.toBeNull();
  });

  it("não lê perfis", async () => {
    const { data } = await anonymous.from("profiles").select("*");
    expect(data ?? []).toEqual([]);
  });
});

describe("perfil", () => {
  it("é criado automaticamente no cadastro", async () => {
    const { data, error } = await alice.client
      .from("profiles")
      .select("id, display_name, time_zone")
      .single();

    expect(error).toBeNull();
    expect(data?.id).toBe(alice.id);
    expect(data?.display_name).toBe("alice");
    expect(data?.time_zone).toBe("America/Sao_Paulo");
  });

  it("cada usuário enxerga somente o próprio", async () => {
    const { data } = await bob.client.from("profiles").select("id");

    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(bob.id);
  });

  it("não é possível apagar o próprio perfil pelo cliente", async () => {
    // Não existe policy de DELETE: a linha continua lá.
    await bob.client.from("profiles").delete().eq("id", bob.id);

    const { count } = await bob.client
      .from("profiles")
      .select("*", { count: "exact", head: true });
    expect(count).toBe(1);
  });
});

describe("invariantes aplicadas pelo banco", () => {
  it("recusa duração fora do intervalo permitido", async () => {
    for (const minutes of [0, 1441]) {
      const { error } = await alice.client
        .from("tasks")
        .insert({ title: "duração inválida", estimated_minutes: minutes });

      expect(error?.message).toContain("tasks_estimated_minutes_range");
    }
  });

  it("recusa título em branco", async () => {
    const { error } = await alice.client
      .from("tasks")
      .insert({ title: "   ", estimated_minutes: 30 });

    expect(error?.message).toContain("tasks_title_not_blank");
  });

  it("recusa duração ausente", async () => {
    const { error } = await alice.client
      .from("tasks")
      // @ts-expect-error omissão proposital: a coluna é NOT NULL sem default
      .insert({ title: "sem duração" });

    expect(error).not.toBeNull();
  });

  it("recusa conclusão inconsistente com a data de conclusão", async () => {
    // O trigger só reage a mudanças de `status`; forçar `completed_at` sozinho
    // precisa esbarrar no CHECK.
    const { error } = await alice.client
      .from("tasks")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", aliceTaskId);

    expect(error?.message).toContain("tasks_status_matches_completed_at");
  });
});

describe("conclusão é carimbada pelo servidor", () => {
  it("preenche completed_at ao concluir e limpa ao reabrir", async () => {
    const id = await createTask(alice, "Ciclo de conclusão", 60);

    const completed = await alice.client
      .from("tasks")
      .update({ status: "DONE" })
      .eq("id", id)
      .select("status, completed_at")
      .single();

    expect(completed.error).toBeNull();
    expect(completed.data?.status).toBe("DONE");
    expect(completed.data?.completed_at).not.toBeNull();

    const reopened = await alice.client
      .from("tasks")
      .update({ status: "TODO" })
      .eq("id", id)
      .select("status, completed_at")
      .single();

    expect(reopened.data?.status).toBe("TODO");
    expect(reopened.data?.completed_at).toBeNull();
  });

  it("ignora o instante enviado pelo cliente e usa o relógio do servidor", async () => {
    const id = await createTask(alice, "Relógio adiantado", 30);
    const wrongClock = new Date("2020-01-01T00:00:00.000Z").toISOString();

    const { data } = await alice.client
      .from("tasks")
      .update({ status: "DONE", completed_at: wrongClock })
      .eq("id", id)
      .select("completed_at")
      .single();

    expect(data?.completed_at).not.toBe(wrongClock);
    const stamped = new Date(data?.completed_at ?? 0).getTime();
    expect(Date.now() - stamped).toBeLessThan(60_000);
  });
});
