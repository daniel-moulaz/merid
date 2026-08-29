/**
 * Substituto do pacote `server-only` nos testes.
 *
 * O pacote real lança ao ser importado fora de um Server Component; nos testes
 * de integração nós SOMOS o servidor, então ele vira um módulo vazio.
 */
export {};
