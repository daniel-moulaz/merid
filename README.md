# Merid

> Dê direção ao seu tempo.

Aplicativo universal (**Android · iOS · Web**) que une **tarefas** e **agenda**,
mantendo as duas coisas separadas:

> Uma tarefa representa algo que preciso fazer.
> Um bloco na agenda representa quando pretendo realmente executar essa tarefa.

Listas de tarefas mostram o que você tem para fazer. Elas não mostram se aquilo
**cabe no seu dia**. Aqui toda tarefa tem duração estimada, e **prazo**
("até sexta") nunca se confunde com **horário** ("quarta, 14h–16h").

**Stack:** Expo / React Native, TypeScript, Supabase / PostgreSQL e TanStack Query.

**Estágio:** candidato ao primeiro piloto, com validação documentada em Android físico. A base também contempla iOS e Web; isso não representa homologação equivalente das três plataformas. Não há uma demo pública hospedada indicada neste repositório.

## Experimente o fluxo principal

Depois de [iniciar o ambiente local](#começando):

1. Na **Inbox**, crie uma tarefa como “Revisar apresentação”, estime 45 minutos e escolha um prazo.
2. Na **Agenda**, reserve um intervalo para essa tarefa. O prazo permanece separado do horário escolhido.
3. Adicione outro bloco sobreposto para observar o aviso de conflito. O usuário decide se mantém os dois.
4. Remova um bloco da agenda: a tarefa continua existindo na Inbox.
5. Conclua a tarefa e consulte **Progresso**, que agrupa as conclusões pelo dia civil no fuso do perfil.

## Decisões para explorar no código

| Decisão | Evidência |
| --- | --- |
| Separar tarefa de bloco de agenda | [Modelo SQL e FK composta](supabase/migrations/20260829160000_schedule_blocks.sql), [testes de integração](tests/rls/schedule-blocks.rls.test.ts) |
| Garantir isolamento no banco, além dos formulários | [Testes de RLS](tests/rls), [arquitetura](docs/ARCHITECTURE.md) |
| Distinguir data civil de instante e usar o fuso do perfil | [Núcleo de datas](src/lib/time), [testes de timezone](src/lib/time/time-zone.test.ts) |
| Detectar conflitos sem impedir sobreposição intencional | [Política](src/modules/schedule/domain/conflict-policy.ts), [testes de intervalos](src/modules/schedule/domain/overlap.test.ts) |

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

## Estado atual — pilot candidate

Este é o escopo **congelado** para o primeiro piloto, validado em Android
físico.

**Conta.** Criar conta, entrar, sair, sessão que sobrevive a fechar o app.
Fuso horário do perfil editável — é ele, e nunca o relógio do aparelho, que
decide o que conta como "hoje".

**Inbox.** Captura rápida (título + Enter), CRUD completo, duração obrigatória,
prioridade, prazo e notas. A lista é agrupada por prazo — atrasadas, hoje,
amanhã, próximos dias, mais adiante, sem prazo.

**Agenda.** Três zooms da mesma agenda: **Hoje** (timeline do dia), **Semana**
(grade de 7 colunas) e **Mês** (densidade). Tocar um horário cria; segurar e
arrastar seleciona um intervalo; segurar um bloco e arrastar o reagenda, com
desfazer. Conflito é detectado e avisado — nunca bloqueado, porque sobreposição
pode ser intencional.

**Progresso.** Sequência atual, melhor sequência e heatmap de conclusões,
agregados no banco por dia civil do usuário.

**Datas.** Interface toda em `DD/MM/AAAA`, com mini calendário para escolher o
dia. O domínio e o banco continuam em ISO.

Cada usuário só enxerga os próprios dados — garantido por RLS no Postgres, com
testes que provam isso. Um bloco não consegue nem apontar para tarefa de outro
usuário: uma FK composta `(task_id, user_id)` torna isso impossível no banco.

### Conscientemente fora do piloto

Arrastar entre dias, redimensionar bloco por gesto, recorrência, notificações,
subtarefas, comentários, projetos/workspaces, sincronização com outros
calendários, IA e colaboração. Nenhum deles está pela metade — nenhum começou.

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
