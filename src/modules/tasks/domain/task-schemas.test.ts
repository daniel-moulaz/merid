import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";

import { createTaskInputSchema, setTaskCompletionInputSchema } from "./task-schemas";

const VALID_FORM = {
  title: "Estudar AEDS",
  description: "",
  estimatedMinutes: "90",
  priority: "HIGH",
  dueDate: "2026-09-01",
  projectId: "",
};

describe("createTaskInputSchema", () => {
  it("aceita o formulário completo e converte os tipos", () => {
    expect(parseInput(createTaskInputSchema, VALID_FORM)).toEqual({
      title: "Estudar AEDS",
      description: null,
      estimatedMinutes: 90,
      priority: "HIGH",
      dueDate: "2026-09-01",
      projectId: null,
    });
  });

  it("remove espaços do título", () => {
    const parsed = parseInput(createTaskInputSchema, { ...VALID_FORM, title: "  Revisar API  " });
    expect(parsed.title).toBe("Revisar API");
  });

  it("usa prioridade média quando não informada", () => {
    const withoutPriority: Record<string, unknown> = { ...VALID_FORM };
    delete withoutPriority["priority"];

    expect(parseInput(createTaskInputSchema, withoutPriority).priority).toBe("MEDIUM");
  });

  it("trata campos vazios como ausentes", () => {
    const parsed = parseInput(createTaskInputSchema, { ...VALID_FORM, dueDate: "" });
    expect(parsed.dueDate).toBeNull();
  });

  it("rejeita título vazio ou só com espaços", () => {
    expect(() => parseInput(createTaskInputSchema, { ...VALID_FORM, title: "   " })).toThrow(
      AppError,
    );
  });

  it("expõe os erros por campo para o formulário", () => {
    try {
      parseInput(createTaskInputSchema, { ...VALID_FORM, title: "", estimatedMinutes: "0" });
      expect.unreachable("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe("VALIDATION");
      expect(Object.keys(appError.fieldErrors ?? {})).toEqual(
        expect.arrayContaining(["title", "estimatedMinutes"]),
      );
    }
  });

  it("rejeita duração fora do intervalo permitido", () => {
    for (const minutes of ["0", "-30", "1441"]) {
      expect(() =>
        parseInput(createTaskInputSchema, { ...VALID_FORM, estimatedMinutes: minutes }),
      ).toThrow(AppError);
    }
  });

  it("rejeita duração fracionada", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_FORM, estimatedMinutes: "12.5" }),
    ).toThrow(AppError);
  });

  it("rejeita prazo com horário: prazo é DIA, não instante", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_FORM, dueDate: "2026-09-01T14:00:00Z" }),
    ).toThrow(AppError);
  });

  it("rejeita prazo em dia inexistente", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_FORM, dueDate: "2026-02-30" }),
    ).toThrow(AppError);
  });

  it("rejeita prioridade desconhecida", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_FORM, priority: "CRITICAL" }),
    ).toThrow(AppError);
  });

  it("rejeita título acima do limite", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_FORM, title: "a".repeat(201) }),
    ).toThrow(AppError);
  });
});

describe("setTaskCompletionInputSchema", () => {
  it("aceita id válido com booleano", () => {
    const input = { id: "0199a4a1-9a3b-7c1e-8f2a-3b4c5d6e7f80", completed: true };
    expect(parseInput(setTaskCompletionInputSchema, input)).toEqual(input);
  });

  it("rejeita id que não é uuid", () => {
    expect(() =>
      parseInput(setTaskCompletionInputSchema, { id: "123", completed: true }),
    ).toThrow(AppError);
  });
});
