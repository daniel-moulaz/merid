import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve o alias "@/*" a partir do tsconfig.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Os testes rodam em um timezone extremo (UTC+14) de propósito: qualquer
    // código que dependa acidentalmente do relógio da máquina quebra aqui em
    // vez de quebrar em produção.
    env: { TZ: "Pacific/Kiritimati" },
  },
});
