import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * O fuso horário do perfil — a única configuração que o cliente escreve.
 *
 * Ela merece testes próprios por dois motivos. É a configuração mais
 * consequente do produto (decide o que é "hoje", em que dia uma conclusão entra
 * no histórico e onde a agenda desenha cada bloco), e é a ÚNICA escrita que o
 * aplicativo faz em `profiles` — uma tabela cujas policies são deliberadamente
 * mais estreitas que as das outras: existe SELECT e UPDATE, e a ausência de
 * policy de INSERT e DELETE é o que nega as duas.
 *
 * Como no resto da suíte, nada aqui usa a chave secreta.
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

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([createUser("tz-alice"), createUser("tz-bob")]);
});

describe("o dono altera o próprio fuso", () => {
  it("grava e devolve o novo fuso, exatamente como o app faz", async () => {
    const { data, error } = await alice.client
      .from("profiles")
      .update({ time_zone: "Asia/Tokyo" })
      .eq("id", alice.id)
      .select("id, display_name, time_zone")
      .single();

    expect(error).toBeNull();
    expect(data?.time_zone).toBe("Asia/Tokyo");
    expect(data?.id).toBe(alice.id);
  });

  it("o PostgREST recusa UPDATE sem filtro — por isso o id vai na chamada", async () => {
    // Na LEITURA o repositório não filtra: a policy já devolve só a própria
    // linha. Na ESCRITA o filtro é obrigatório, e não por causa do RLS — é uma
    // trava do PostgREST contra atualizar a tabela inteira sem querer. Este
    // caso existe para que a diferença fique documentada em vez de virar de
    // novo um "algo deu errado" na tela de Conta.
    const { error } = await alice.client
      .from("profiles")
      .update({ time_zone: "Europe/Lisbon" })
      .select();

    expect(error).not.toBeNull();
    expect(error?.message).toContain("WHERE");
  });

  it("a leitura seguinte enxerga o valor gravado", async () => {
    const { data } = await alice.client.from("profiles").select("time_zone").single();
    expect(data?.time_zone).toBe("Asia/Tokyo");
  });

  it("o fuso de outro usuário não é afetado", async () => {
    const { data } = await bob.client.from("profiles").select("time_zone").single();
    expect(data?.time_zone).toBe("America/Sao_Paulo");
  });
});

describe("isolamento", () => {
  it("UPDATE no perfil alheio não altera nada", async () => {
    // A policy filtra a linha: o comando é aceito e não encontra o que mudar.
    await alice.client
      .from("profiles")
      .update({ time_zone: "Pacific/Kiritimati" })
      .eq("id", bob.id);

    const { data } = await bob.client.from("profiles").select("time_zone").single();
    expect(data?.time_zone).toBe("America/Sao_Paulo");
  });

  it("o usuário anônimo não lê nem escreve perfil", async () => {
    const anon = createAnonymousClient();

    const read = await anon.from("profiles").select("id");
    expect(read.data ?? []).toHaveLength(0);

    const write = await anon.from("profiles").update({ time_zone: "Asia/Tokyo" }).eq("id", alice.id);
    const { data } = await alice.client.from("profiles").select("time_zone").single();

    expect(write.error === null || write.error.code === "42501").toBe(true);
    expect(data?.time_zone).toBe("Asia/Tokyo");
  });
});

describe("invariantes do banco", () => {
  it("recusa fuso em branco", async () => {
    const { error } = await alice.client
      .from("profiles")
      .update({ time_zone: "   " })
      .eq("id", alice.id)
      .select();

    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("profiles_time_zone_not_blank");
  });

  it("o perfil não pode ser apagado pelo cliente", async () => {
    await alice.client.from("profiles").delete().eq("id", alice.id);

    const { data } = await alice.client.from("profiles").select("id").single();
    expect(data?.id).toBe(alice.id);
  });
});
