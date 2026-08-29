# Dayflow

> Nome provisório — o código não depende dele.

Aplicativo universal (**Android · iOS · Web**) que une **tarefas** e **agenda**,
mantendo as duas coisas separadas:

> Uma tarefa representa algo que preciso fazer.
> Um bloco na agenda representa quando pretendo realmente executar essa tarefa.

Listas de tarefas mostram o que você tem para fazer. Elas não mostram se aquilo
**cabe no seu dia**. Aqui toda tarefa tem duração estimada, e **prazo**
("até sexta") nunca se confunde com **horário** ("quarta, 14h–16h").

## Começando

Requisitos: Node 20+ e Docker.

```bash
cp .env.example .env
npm install
npm run db:start     # Supabase local (Postgres + Auth) via Docker
npm start            # Metro — escolha web, Android ou iOS
```

Crie uma conta na própria tela do app: o Supabase local vem com confirmação de
e-mail desligada, então o cadastro já entra direto.

> **Dispositivo físico:** `127.0.0.1` aponta para o próprio aparelho. Troque
> `EXPO_PUBLIC_SUPABASE_URL` no `.env` pelo IP da sua máquina na rede local.

## Estado atual

**Conta e Inbox.** Criar conta, entrar, sair, sessão que sobrevive a fechar o
app, e CRUD completo de tarefas (criar, editar, concluir, reabrir, excluir) com
duração obrigatória, prazo e prioridade.

**Agenda (Etapa 2).** Agendar uma tarefa em um intervalo, ver o dia em uma
timeline vertical, editar/reagendar, remover da agenda sem apagar a tarefa e
concluir a tarefa direto pelo bloco. Conflito de horário é detectado e avisado —
nunca bloqueado, porque sobreposição pode ser intencional.

Cada usuário só enxerga os próprios dados — garantido por RLS no Postgres, com
testes que provam isso. Um bloco não consegue nem apontar para tarefa de outro
usuário: uma FK composta `(task_id, user_id)` torna isso impossível no banco.

Próximo (Etapa 3): consistência, streak e heatmap.

### Problema conhecido do ambiente local

Se `npm run test:rls` falhar com **`JWT issued at future`**, o relógio da VM do
Docker está adiantado em relação ao host — acontece depois que o Windows
suspende. Não é falha do código:

```bash
wsl -d docker-desktop -e sh -c "hwclock -s"
```

## Documentação

- [docs/PRODUCT.md](docs/PRODUCT.md) — proposta, princípios, regras de domínio,
  fórmula de consistência e escopo.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — stack, estrutura, RLS,
  **estratégia de datas/timezone** e decisões técnicas.
- [docs/MIGRATION.md](docs/MIGRATION.md) — por que a fundação foi trocada e o
  que veio da implementação anterior.

## Scripts

| Script | O que faz |
| --- | --- |
| `npm start` | Metro (escolha a plataforma) |
| `npm run web` / `android` / `ios` | abre direto na plataforma |
| `npm run export:web` | build estático da web em `dist/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | testes unitários (sem banco) |
| `npm run test:rls` | testes de RLS (exige `db:start`) |
| `npm run test:all` | as duas suítes |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local |
| `npm run db:status` | URLs e chaves locais |
| `npm run db:types` | regenera os tipos do banco |
