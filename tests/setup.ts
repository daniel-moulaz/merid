import "dotenv/config";

// As chamadas de rede contra o Supabase local (signUp, signIn) são lentas o
// bastante para estourar o padrão de 5s do Jest.
jest.setTimeout(30_000);
