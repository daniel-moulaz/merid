/**
 * O Metro configura o Babel sozinho, mas o Jest precisa deste arquivo para
 * transformar TypeScript/JSX nos testes.
 */
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
