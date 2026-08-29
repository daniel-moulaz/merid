import { isDueToday, isOverdue, taskCompletionFields, taskReopenFields } from "./task";

const TODAY = "2026-08-29";

describe("isOverdue", () => {
  it("é atrasada quando o prazo já passou e a tarefa está aberta", () => {
    expect(isOverdue({ status: "TODO", dueDate: "2026-08-28" }, TODAY)).toBe(true);
  });

  it("não é atrasada no próprio dia do prazo", () => {
    expect(isOverdue({ status: "TODO", dueDate: TODAY }, TODAY)).toBe(false);
  });

  it("não é atrasada quando o prazo é futuro", () => {
    expect(isOverdue({ status: "TODO", dueDate: "2026-08-30" }, TODAY)).toBe(false);
  });

  it("tarefa sem prazo nunca está atrasada", () => {
    expect(isOverdue({ status: "TODO", dueDate: null }, TODAY)).toBe(false);
  });

  it("tarefa concluída nunca aparece como atrasada", () => {
    expect(isOverdue({ status: "DONE", dueDate: "2026-01-01" }, TODAY)).toBe(false);
  });
});

describe("isDueToday", () => {
  it("distingue vencer hoje de estar atrasada", () => {
    expect(isDueToday({ status: "TODO", dueDate: TODAY }, TODAY)).toBe(true);
    expect(isDueToday({ status: "TODO", dueDate: "2026-08-28" }, TODAY)).toBe(false);
    expect(isDueToday({ status: "DONE", dueDate: TODAY }, TODAY)).toBe(false);
  });
});

describe("transições de conclusão", () => {
  const now = new Date("2026-08-29T17:00:00.000Z");

  it("concluir preenche status e completedAt juntos", () => {
    expect(taskCompletionFields(now)).toEqual({ status: "DONE", completedAt: now });
  });

  it("reabrir limpa completedAt (invariante exigida pelo banco)", () => {
    expect(taskReopenFields()).toEqual({ status: "TODO", completedAt: null });
  });

  it("as duas transições são inversas em termos de status", () => {
    expect(taskCompletionFields(now).status).not.toBe(taskReopenFields().status);
    expect(taskReopenFields().completedAt).toBeNull();
  });
});
