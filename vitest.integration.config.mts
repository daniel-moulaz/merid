import "dotenv/config";

import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Testes de integração: rodam contra um Postgres real, em um banco separado.
 *
 * Ficam fora de `npm test` de propósito — a suíte unitária precisa continuar
 * rápida e sem dependência de infraestrutura.
 */

const databaseUrl = process.env["DATABASE_URL_TEST"];
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_TEST não definida. Copie .env.example para .env e rode `npm run db:up`.",
  );
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.ts"],
    // O código sob teste lê DATABASE_URL; aqui ele aponta para o banco de testes.
    env: { DATABASE_URL: databaseUrl, TZ: "Pacific/Kiritimati" },
    // Os testes truncam as tabelas entre casos: nada de paralelismo.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
