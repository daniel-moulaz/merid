import type { CalendarDate } from "@/lib/time";

import type { Task } from "./task";
import { groupTasksByDue, taskGroupKey } from "./task-grouping";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js. O
 * agrupamento é comparação de datas civis: nada aqui pode olhar o relógio.
 */

const TODAY: CalendarDate = "2026-08-30";

function task(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: "Tarefa",
    description: null,
    estimatedMinutes: 30,
    priority: "MEDIUM",
    dueDate: null,
    status: "TODO",
    completedAt: null,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("taskGroupKey", () => {
  it("sem prazo vai para a própria seção", () => {
    expect(taskGroupKey({ dueDate: null }, TODAY)).toBe("NO_DUE_DATE");
  });

  it("prazo passado é atraso, por um dia que seja", () => {
    expect(taskGroupKey({ dueDate: "2026-08-29" }, TODAY)).toBe("OVERDUE");
    expect(taskGroupKey({ dueDate: "2020-01-01" }, TODAY)).toBe("OVERDUE");
  });

  it("hoje e amanhã têm seções próprias", () => {
    expect(taskGroupKey({ dueDate: "2026-08-30" }, TODAY)).toBe("TODAY");
    expect(taskGroupKey({ dueDate: "2026-08-31" }, TODAY)).toBe("TOMORROW");
  });

  it("a janela dos próximos dias fecha sete dias à frente de hoje", () => {
    // Hoje é 30/08, então a janela vai até 06/09 e 07/09 já é "mais adiante".
    expect(taskGroupKey({ dueDate: "2026-09-01" }, TODAY)).toBe("THIS_WEEK");
    expect(taskGroupKey({ dueDate: "2026-09-06" }, TODAY)).toBe("THIS_WEEK");
    expect(taskGroupKey({ dueDate: "2026-09-07" }, TODAY)).toBe("LATER");
  });

  it("atravessa a virada do mês e do ano sem tratamento especial", () => {
    expect(taskGroupKey({ dueDate: "2027-01-01" }, "2026-12-31")).toBe("TOMORROW");
    expect(taskGroupKey({ dueDate: "2026-12-31" }, "2027-01-01")).toBe("OVERDUE");
  });
});

describe("groupTasksByDue", () => {
  it("devolve as seções na ordem de urgência", () => {
    const groups = groupTasksByDue(
      [
        task({ id: "sem-prazo" }),
        task({ id: "depois", dueDate: "2026-10-01" }),
        task({ id: "hoje", dueDate: TODAY }),
        task({ id: "atrasada", dueDate: "2026-08-01" }),
        task({ id: "amanha", dueDate: "2026-08-31" }),
        task({ id: "semana", dueDate: "2026-09-02" }),
      ],
      TODAY,
    );

    expect(groups.map((group) => group.key)).toEqual([
      "OVERDUE",
      "TODAY",
      "TOMORROW",
      "THIS_WEEK",
      "LATER",
      "NO_DUE_DATE",
    ]);
  });

  it("não devolve seção vazia", () => {
    const groups = groupTasksByDue([task({ id: "a" })], TODAY);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("NO_DUE_DATE");
    expect(groups[0]?.label).toBe("Sem prazo");
  });

  it("preserva a ordem recebida dentro da seção", () => {
    // A ordenação vem do servidor; agrupar não pode reordenar.
    const groups = groupTasksByDue(
      [
        task({ id: "primeira", dueDate: TODAY, priority: "URGENT" }),
        task({ id: "segunda", dueDate: TODAY, priority: "LOW" }),
        task({ id: "terceira", dueDate: TODAY, priority: "HIGH" }),
      ],
      TODAY,
    );

    expect(groups[0]?.tasks.map((item) => item.id)).toEqual([
      "primeira",
      "segunda",
      "terceira",
    ]);
  });

  it("uma lista vazia não produz seção nenhuma", () => {
    expect(groupTasksByDue([], TODAY)).toEqual([]);
  });

  it("não perde nenhuma tarefa", () => {
    const tasks = [
      task({ id: "a", dueDate: "2026-08-01" }),
      task({ id: "b", dueDate: TODAY }),
      task({ id: "c" }),
      task({ id: "d", dueDate: "2026-12-01" }),
    ];

    const total = groupTasksByDue(tasks, TODAY).reduce(
      (count, group) => count + group.tasks.length,
      0,
    );

    expect(total).toBe(tasks.length);
  });
});
