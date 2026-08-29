import "dotenv/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { Client } from "pg";

/**
 * Prepara o banco usado pelos testes de integração.
 *
 * Idempotente: cria `app_test` se ainda não existir e aplica as migrations.
 * O banco de testes é separado do de desenvolvimento porque os testes apagam
 * todas as tabelas entre casos.
 */

const testUrl = process.env["DATABASE_URL_TEST"];
if (!testUrl) {
  throw new Error("DATABASE_URL_TEST não definida. Veja .env.example.");
}

const url = new URL(testUrl);
const databaseName = url.pathname.replace(/^\//, "");
if (!databaseName) {
  throw new Error(`DATABASE_URL_TEST sem nome de banco: ${testUrl}`);
}

// Conecta no banco administrativo `postgres` para poder criar o de testes.
const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";

const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();

const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);

if (existing.rowCount === 0) {
  // O nome vem do .env (não de entrada de usuário) e é interpolado porque
  // CREATE DATABASE não aceita parâmetros. Escapamos aspas por segurança.
  await admin.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`);
  console.log(`banco de testes criado: ${databaseName}`);
} else {
  console.log(`banco de testes já existe: ${databaseName}`);
}

await admin.end();

/**
 * Executamos o CLI do Prisma pelo próprio Node em vez de `npx`: o Node 24 se
 * recusa a executar arquivos `.cmd` sem `shell: true`, e `shell: true` não
 * escapa argumentos.
 */
function resolvePrismaCli(): string {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("prisma/package.json");
  const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf8"));

  const bin =
    typeof packageJson === "object" && packageJson !== null && "bin" in packageJson
      ? (packageJson as { bin: Record<string, string> }).bin["prisma"]
      : undefined;

  if (!bin) throw new Error("Não foi possível localizar o CLI do Prisma.");
  return join(dirname(packagePath), bin);
}

execFileSync(process.execPath, [resolvePrismaCli(), "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});

console.log("migrations aplicadas no banco de testes");
