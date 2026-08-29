# Migração: Next.js + Prisma → Expo + Supabase

Registro do que aconteceu na correção de fundação da Etapa 1, para que a
decisão não precise ser reconstruída de memória depois.

## Por que

A primeira tentativa foi construída em Next.js (App Router) com Server Actions
e Prisma contra um Postgres próprio. Funcionava, com lint/typecheck/build verdes
e 72 testes passando — mas estava **arquiteturalmente errada** para o produto:

- **Server Actions amarram o cliente ao Next.js.** O produto precisa rodar
  nativamente em Android e iOS a partir da mesma base.
- **Prisma pressupõe um servidor de aplicação** entre o cliente e o banco. Nesta
  arquitetura não há esse servidor.
- **A sessão era falsa** (`DEV_USER_EMAIL`), sem autenticação real.

## O checkpoint

Nada foi perdido. O estado anterior está preservado em três referências:

```
main                          d520eef   intacta
legacy/etapa1-nextjs-prisma   d520eef   branch de resgate
tag checkpoint/etapa1-nextjs-prisma     marca o mesmo commit
migration/expo-supabase                 esta implementação
```

Recuperar qualquer coisa:

```bash
git checkout legacy/etapa1-nextjs-prisma
git checkout checkpoint/etapa1-nextjs-prisma -- <arquivo>
```

Durante a migração os arquivos antigos ficaram em `_legacy_nextjs/` — uma
quarentena, não uma exclusão (foram `git mv`, não `rm`). Isso permitiu portar o
domínio com os originais lado a lado.

## O que foi portado sem alterar a lógica

O trabalho conceitual valioso estava quase todo em TypeScript puro, sem uma
linha de Next ou Prisma. Ele atravessou a troca de stack praticamente intacto —
o motivo de a fundação errada não ter custado o principal.

| Arquivo | Reaproveitamento | Ajuste |
| --- | --- | --- |
| `lib/time/calendar-date.ts` | **byte a byte** | nenhum |
| `lib/time/time-zone.ts` | **byte a byte** | nenhum |
| `lib/time/duration.ts` | **byte a byte** | nenhum |
| `lib/time/*.test.ts` (33 testes) | integral | só o import do runner |
| `tasks/domain/task.ts` | integral | `projectId` → `updatedAt` |
| `tasks/domain/task-schemas.ts` | lógica preservada | ver D5 abaixo |
| `tasks/domain/*.test.ts` | integral | import do runner |
| `lib/errors.ts` | integral | nenhum |
| `lib/validation.ts` | `parseInput` | `formDataToObject` removido |
| `docs/PRODUCT.md` | integral | só a tabela de estado do MVP |

As `CHECK constraints` da migration do Prisma foram traduzidas quase
literalmente para o SQL do Supabase.

## O que foi reescrito

| Antes | Depois | Motivo |
| --- | --- | --- |
| `src/app/**` (Next) | `src/app/**` (Expo Router) | rotas universais |
| `task-actions.ts` (Server Actions) | hooks TanStack Query | **causa raiz** |
| `action-result.ts` | estados do TanStack Query | não havia mais action |
| `task-service.ts` (Prisma) | `task-repository.ts` (supabase-js) | sem servidor próprio |
| `prisma/schema.prisma` + migration | `supabase/migrations/*.sql` | SQL versionado |
| `lib/db.ts` | `lib/supabase.ts` | cliente novo |
| `lib/auth/session.ts` (`DEV_USER_EMAIL`) | Supabase Auth + `auth-context` | autenticação real |
| ownership em `where: { id_userId }` | **RLS policies** | garantia sai do app e vai para o banco |
| shadcn/ui + Tailwind | `StyleSheet` + tokens | não roda em React Native |
| Vitest | Jest + jest-expo | um runner só, com suporte a RN |
| `docker-compose.yml` | Supabase CLI | stack local completa |

## Mudanças de comportamento deliberadas

Três coisas mudaram de propósito, não por acidente:

1. **Autorização saiu do código e foi para o banco.** Antes, o isolamento
   dependia de todo caso de uso lembrar de filtrar por `userId`. Agora é RLS:
   nenhum caminho de acesso escapa, nem um cliente modificado.

2. **A conclusão passou a ser carimbada pelo servidor.** Antes o app enviava
   `completedAt` do relógio do dispositivo. Um relógio errado colocaria a tarefa
   no dia errado — e o dia é a unidade das métricas de consistência. Agora um
   trigger define o valor; a regra de domínio continua existindo para prever o
   estado na atualização otimista da tela.

3. **Os schemas perderam a coerção de string.** `z.coerce.number()` existia por
   causa do `FormData` do Next. Além de desnecessária, ela deixava o tipo de
   entrada como `unknown` e quebrava a inferência do React Hook Form.

## Ganho que não estava previsto

O PostgREST devolve colunas `date` como string `"YYYY-MM-DD"` — exatamente a
representação de `CalendarDate`. O prazo agora atravessa a rede sem nunca virar
um objeto `Date`, eliminando a conversão que o Prisma obrigava e, com ela, toda
uma classe de bugs de "a tarefa mudou de dia".

## Escopo removido

`ScheduleBlock`, `Project` e `Reminder` foram modelados na Etapa 1 e **não** têm
tabela nesta implementação. As regras continuam especificadas em
[PRODUCT.md](./PRODUCT.md); as tabelas entram na Etapa 2, quando forem usadas.
Criar tabela vazia hoje seria adivinhação.
