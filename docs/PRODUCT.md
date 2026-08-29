# Produto

> Nome provisório: **Dayflow**. O nome não aparece no código — só aqui e no
> `layout.tsx`. Renomear deve custar uma linha.

## Proposta

Listas de tarefas mostram **o que** você tem para fazer. Elas não mostram se
aquilo **cabe no seu dia**.

Este produto une as duas coisas mantendo-as separadas:

| Conceito          | Responde                       | Entidade        |
| ----------------- | ------------------------------ | --------------- |
| Tarefa            | O que preciso fazer            | `Task`          |
| Bloco de agenda   | Quando pretendo executar isso  | `ScheduleBlock` |

A tarefa "Estudar AEDS · 1h30 · até terça · prioridade alta" existe
independentemente de horário. Quando eu decido executá-la segunda das 14:00 às
15:30, isso cria um **bloco** — a tarefa continua sendo a mesma. Reagendar mexe
no bloco, nunca recria a tarefa.

## Princípios

1. **A experiência principal é uma agenda, não uma lista.** Timeline e
   calendário vêm antes de qualquer lista.
2. **Duração é obrigatória.** Sem `estimatedMinutes` não dá para saber se o
   planejamento cabe no dia. É o pilar do produto, não um campo opcional.
3. **Prazo ≠ horário.** "Preciso terminar até sexta" e "vou fazer quarta das 14h
   às 16h" são informações diferentes e nunca compartilham o mesmo campo.
4. **Consistência não é contagem de tarefas.** Fechar cinco tarefas de 5 minutos
   não é um dia melhor do que executar um bloco de 3 horas do que importa.
5. **Incentivo sem punição.** O streak celebra a sequência; ele não humilha
   quem quebrou.
6. **Criar tarefa precisa ser instantâneo.** Sem modal gigante, sem formulário
   de dez campos.

## Regras de domínio

Estas regras são o contrato do produto. Mudá-las é decisão de produto, não de
implementação.

### R1 — Task e ScheduleBlock são entidades separadas

Uma `Task` **não precisa** de horário para existir. Um `ScheduleBlock`
representa a alocação temporal de uma `Task`.

**A relação é 1:N** (uma tarefa, vários blocos). A especificação original
sugeria 1:1, mas 1:N é necessário para dividir uma tarefa em sessões, para
recorrência (R7) e para estender duração (R6) sem recriar nada. Uma tarefa com
zero blocos é uma tarefa **não agendada**.

### R2 — Inbox = tarefas sem nenhum bloco

A Inbox não é um estado guardado na tarefa; é uma **consulta**: tarefas abertas
que ainda não têm nenhum bloco de agenda. Agendar uma tarefa a tira da Inbox
automaticamente, sem nenhum campo extra para manter sincronizado.

### R3 — Prazo é um DIA, não um instante

`dueDate` é uma data civil (`2026-09-01`), sem horário e sem timezone. Nunca
deve ser modelado, comparado ou exibido como instante. Ver
[ARCHITECTURE.md](./ARCHITECTURE.md#datas-e-timezone).

### R4 — Duração estimada ≠ duração alocada

- `Task.estimatedMinutes`: quanto eu acho que a tarefa leva.
- Duração do bloco (`endsAt - startsAt`): quanto tempo eu reservei na agenda.

Podem divergir de propósito (reservei 1h para uma tarefa que estimei em 1h30, e
vou terminar depois). Ao agendar, a duração do bloco é **sugerida** a partir da
estimativa, mas o usuário pode mudar. Métricas de planejamento usam a duração do
**bloco**; a estimativa serve para dimensionar o que ainda não foi agendado.

### R5 — Blocos usam intervalo semiaberto `[startsAt, endsAt)`

Um bloco 14:00–15:00 e outro 15:00–16:00 **não conflitam**. Dois blocos
conflitam quando `a.startsAt < b.endsAt AND b.startsAt < a.endsAt`.

Sem essa regra, todo bloco encostado no anterior viraria falso conflito. A
duração precisa ser positiva (`endsAt > startsAt`), garantido pelo banco.

### R6 — Estender duração (futuro)

Quando uma tarefa passar do tempo, o usuário poderá `+15 min`, `+30 min` ou
reagendar. Isso **estende o bloco**, não cria outro nem altera a estimativa da
tarefa. Se a extensão gerar conflito (R5), o app oferecerá empurrar o próximo
bloco, escolher outro horário, ou manter o conflito — conflito nunca é
bloqueante.

### R7 — Recorrência (futuro)

Recorrência gera **tarefas**, não blocos. Uma regra ("Academia, seg/qua/sex, 1h,
preferência 17h–20h") materializa uma `Task` por ocorrência; agendar continua
sendo um ato separado. A janela de preferência é uma dica para a sugestão
automática de horário, não uma restrição rígida.

### R8 — Lembretes pertencem ao bloco ou à tarefa

- Lembrete de **execução** ("hora de começar") pertence ao `ScheduleBlock`.
- Lembrete de **prazo** ("vence hoje") pertence à `Task`.

Nunca aos dois ao mesmo tempo — o banco recusa.

## Consistência e streak

> Regra determinística, versionada aqui. Mudar os números abaixo é mudar o
> produto: quando mudar, anote a data e a motivação.

### Score do dia

Para um dia `D` **no timezone do usuário**:

```
blocos(D)        = blocos cujo startsAt ∈ [início(D), início(D+1))
peso(bloco)      = TASK_PRIORITY_WEIGHT[bloco.task.priority]
                   LOW 0.5 · MEDIUM 1 · HIGH 1.5 · URGENT 2
duração(bloco)   = endsAt − startsAt, em minutos

pesoPlanejado(D) = Σ peso(b) × duração(b)                    para b ∈ blocos(D)
pesoConcluído(D) = Σ peso(b) × duração(b)                    para b ∈ blocos(D)
                     onde b.task.status = DONE
                       e b.task.completedAt < início(D+1)

score(D)         = pesoConcluído(D) / pesoPlanejado(D)       ∈ [0, 1]
```

Se `pesoPlanejado(D) = 0`, o dia é **vazio** — não tem score. Um dia sem
planejamento não é um dia ruim; é um dia sobre o qual não há o que dizer.

Por que ponderar por prioridade **e** por minutos: sem os minutos, uma tarefa de
10 min vale igual a uma de 3h; sem a prioridade, o urgente vale igual ao
opcional. As duas correções juntas são o que separa "consistência" de "contagem
de tarefas".

### Dia consistente

```
CONSISTENCY_THRESHOLD = 0.70
dia consistente ⟺ score(D) ≥ 0.70
```

### Streak

- **Sequência atual**: dias consistentes consecutivos, contados de trás para
  frente a partir de hoje.
- **Hoje tem carência**: o dia em curso só entra na conta quando já é
  consistente; enquanto não for, ele não quebra nada.
- **Dia vazio quebra a sequência** (exceto hoje). Sem isso, quem nunca planeja
  manteria streak infinito e o número perderia significado.
- **Melhor sequência**: maior sequência já alcançada, guardada para sempre —
  quebrar o streak não apaga o recorde.

### Percentuais exibidos

- **Semana atual**: `dias consistentes / dias não vazios da semana`.
- **Consistência em 30 dias**: média de `score(D)` dos dias **não vazios** dos
  últimos 30 dias.
- **Heatmap**: cada quadrado é um dia, em cinco faixas —
  vazio (sem plano) · `< 40%` · `40–69%` · `70–89%` · `≥ 90%`.

Ao clicar em um dia:

```
22 de agosto
5/6 tarefas concluídas
3h40 / 4h20 planejadas
86% do dia concluído
```

## Escopo

### MVP

| #   | Item                                   | Estado           |
| --- | -------------------------------------- | ---------------- |
| 1   | Estrutura do projeto                   | ✅ feito          |
| 2   | Banco e modelagem                      | ✅ feito          |
| 3   | Criação de tarefa                      | ✅ feito          |
| 4   | Edição de tarefa                       | ✅ feito          |
| 5   | Conclusão / reabertura                 | ✅ feito          |
| 6   | Duração estimada                       | ✅ feito          |
| 7   | Prazo                                  | ✅ feito          |
| 8   | Prioridade                             | ✅ feito          |
| 9   | Inbox                                  | ✅ feito          |
| 10  | Agendar tarefa em um horário           | ⬜ modelado       |
| 11  | Visualizar agenda do dia               | ⬜                |
| 12  | Remover / reagendar bloco              | ⬜ modelado       |
| 13  | Visão semanal básica                   | ⬜                |
| 14  | Persistência real                      | ✅ feito          |
| 15  | Cálculo inicial de consistência        | ⬜ regra definida |
| 16  | Heatmap de consistência                | ⬜                |
| 17  | Layout responsivo                      | ✅ feito          |
| 18  | PWA básica                             | ◐ manifest ok    |

### Depois do MVP

Recorrência · notificações push · drag and drop · extensão automática de blocos ·
sugestão de horário · IA · integrações externas.

### Não objetivos (por enquanto)

- **IA de qualquer tipo.** Nem parsing de linguagem natural, nem organização
  automática do dia. Entram depois do MVP inteiro fechado.
- **Colaboração / múltiplos usuários no mesmo espaço.** O modelo já é
  multi-usuário, mas o produto é pessoal.
- **Integração com Google Calendar / Outlook.**
- **Aplicativo nativo.** PWA cobre o caso de uso.
- **Micro-otimização de produtividade** (pomodoro, time tracking automático).
