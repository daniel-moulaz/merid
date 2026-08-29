/**
 * Duas suítes com objetivos diferentes:
 *
 *  unit — domínio puro (tempo, regras, schemas). Sem rede, sem banco, roda em
 *         milissegundos. É a que roda o tempo todo.
 *  rls  — integração contra o Supabase local: prova que as policies realmente
 *         isolam os dados entre usuários. Precisa de `npm run db:start`.
 *
 * A suíte unitária roda em UTC+14 de propósito: qualquer código que dependa
 * acidentalmente do relógio da máquina falha aqui, não em produção.
 */
process.env.TZ = "Pacific/Kiritimati";

module.exports = {
  projects: [
    {
      displayName: "unit",
      preset: "jest-expo/universal",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
    },
    {
      displayName: "rls",
      // Sem o preset do Expo de propósito: estes testes são Node puro falando
      // HTTP com o Supabase local. O preset resolveria o supabase-js pela
      // condição de exportação do React Native, trazendo ESM que o Jest não
      // transforma.
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/**/*.test.ts"],
      // Babel padrão em vez de `babel-preset-expo`: o preset do Expo injeta um
      // módulo virtual de variáveis de ambiente que só existe sob o Metro.
      transform: {
        "^.+\.[jt]sx?$": [
          "babel-jest",
          {
            // `configFile: false` ignora o babel.config.js da raiz — ele
            // carrega o babel-preset-expo, que injeta um módulo virtual de
            // ambiente que só existe sob o Metro.
            configFile: false,
            babelrc: false,
            // O Node 24 já entende toda a sintaxe moderna: só é preciso
            // remover os tipos e converter os módulos para CommonJS.
            presets: ["@babel/preset-typescript"],
            plugins: ["@babel/plugin-transform-modules-commonjs"],
          },
        ],
      },
      moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
      setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
    },
  ],
};
