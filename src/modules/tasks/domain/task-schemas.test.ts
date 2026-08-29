import { AppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";

import { createTaskInputSchema } from "./task-schemas";

/**
 * Diferença em relação à Etapa 1: o formulário entrega tipos concretos
 * (`number` para minutos), então o schema não faz mais coerção de string. A
 * coerção existia por causa do `FormData` do Next, que não existe aqui.
 */

const VALID_INPUT = {
  title: "Estudar AEDS",
  description: null,
  estimatedMinutes: 90,
  priority: "HIGH",
  dueDate: "2026-09-01",
} as const;

describe("createTaskInputSchema", () => {
  it("aceita a entrada completa", () => {
    expect(parseInput(createTaskInputSchema, VALID_INPUT)).toEqual({
      title: "Estudar AEDS",
      description: null,
      estimatedMinutes: 90,
      priority: "HIGH",
      dueDate: "2026-09-01",
    });
  });

  it("remove espaços do título e da descrição", () => {
    const parsed = parseInput(createTaskInputSchema, {
      ...VALID_INPUT,
      title: "  Revisar API  ",
      description: "  dois endpoints  ",
    });

    expect(parsed.title).toBe("Revisar API");
    expect(parsed.description).toBe("dois endpoints");
  });

  it("trata texto vazio como ausente", () => {
    const parsed = parseInput(createTaskInputSchema, {
      ...VALID_INPUT,
      description: "   ",
      dueDate: "",
    });

    expect(parsed.description).toBeNull();
    expect(parsed.dueDate).toBeNull();
  });

  it("usa prioridade média quando não informada", () => {
    const withoutPriority: Record<string, unknown> = { ...VALID_INPUT };
    delete withoutPriority["priority"];

    expect(parseInput(createTaskInputSchema, withoutPriority).priority).toBe("MEDIUM");
  });

  it("rejeita título vazio ou só com espaços", () => {
    expect(() => parseInput(createTaskInputSchema, { ...VALID_INPUT, title: "   " })).toThrow(
      AppError,
    );
  });

  it("expõe os erros por campo para o formulário", () => {
    try {
      parseInput(createTaskInputSchema, { ...VALID_INPUT, title: "", estimatedMinutes: 0 });
      throw new Error("deveria ter lançado antes desta linha");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe("VALIDATION");
      expect(Object.keys(appError.fieldErrors ?? {})).toEqual(
        expect.arrayContaining(["title", "estimatedMinutes"]),
      );
    }
  });
});

describe("duração estimada", () => {
  it("é obrigatória", () => {
    const withoutDuration: Record<string, unknown> = { ...VALID_INPUT };
    delete withoutDuration["estimatedMinutes"];

    expect(() => parseInput(createTaskInputSchema, withoutDuration)).toThrow(AppError);
  });

  it("rejeita valores fora do intervalo de 1 minuto a 24 horas", () => {
    for (const minutes of [0, -30, 1441]) {
      expect(() =>
        parseInput(createTaskInputSchema, { ...VALID_INPUT, estimatedMinutes: minutes }),
      ).toThrow(AppError);
    }
  });

  it("aceita os limites exatos", () => {
    expect(
      parseInput(createTaskInputSchema, { ...VALID_INPUT, estimatedMinutes: 1 }).estimatedMinutes,
    ).toBe(1);
    expect(
      parseInput(createTaskInputSchema, { ...VALID_INPUT, estimatedMinutes: 1440 })
        .estimatedMinutes,
    ).toBe(1440);
  });

  it("rejeita duração fracionada", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_INPUT, estimatedMinutes: 12.5 }),
    ).toThrow(AppError);
  });

  it("rejeita texto: a conversão é responsabilidade do formulário", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_INPUT, estimatedMinutes: "90" }),
    ).toThrow(AppError);
  });
});

describe("prazo", () => {
  it("rejeita prazo com horário: prazo é DIA, não instante", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_INPUT, dueDate: "2026-09-01T14:00:00Z" }),
    ).toThrow(AppError);
  });

  it("rejeita dia inexistente", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_INPUT, dueDate: "2026-02-30" }),
    ).toThrow(AppError);
  });

  it("rejeita formato brasileiro", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_INPUT, dueDate: "01/09/2026" }),
    ).toThrow(AppError);
  });
});

describe("prioridade", () => {
  it("rejeita valor desconhecido", () => {
    expect(() =>
      parseInput(createTaskInputSchema, { ...VALID_INPUT, priority: "CRITICAL" }),
    ).toThrow(AppError);
  });
});
