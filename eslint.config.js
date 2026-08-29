const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/**",
      // Quarentena da migração: código Next/Prisma aguardando remoção autorizada.
      "_legacy_nextjs/**",
      ".expo/**",
      "supabase/.temp/**",
    ],
  },
]);
