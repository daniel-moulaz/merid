import { describe, expect, it } from "vitest";

import {
  addDaysToCalendarDate,
  assertCalendarDate,
  calendarDateToUtcDate,
  compareCalendarDates,
  daysBetweenCalendarDates,
  formatCalendarDate,
  isCalendarDate,
  utcDateToCalendarDate,
} from "./calendar-date";

describe("ambiente de teste", () => {
  it("roda em um timezone diferente de UTC (protege contra dependência do relógio local)", () => {
    expect(new Date().getTimezoneOffset()).not.toBe(0);
  });
});

describe("isCalendarDate", () => {
  it("aceita datas civis válidas", () => {
    expect(isCalendarDate("2026-08-29")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true); // ano bissexto
    expect(isCalendarDate("1999-12-31")).toBe(true);
  });

  it("rejeita formatos inválidos", () => {
    expect(isCalendarDate("29/08/2026")).toBe(false);
    expect(isCalendarDate("2026-8-29")).toBe(false);
    expect(isCalendarDate("2026-08-29T10:00:00Z")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
    expect(isCalendarDate(undefined)).toBe(false);
    expect(isCalendarDate(new Date())).toBe(false);
  });

  it("rejeita dias que não existem", () => {
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-02-29")).toBe(false); // 2026 não é bissexto
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-04-31")).toBe(false);
    expect(isCalendarDate("2026-00-10")).toBe(false);
  });

  it("rejeita anos de dois dígitos remapeados pelo Date", () => {
    expect(isCalendarDate("0026-08-29")).toBe(false);
  });
});

describe("conversão com o banco", () => {
  it("faz round-trip sem perder o dia", () => {
    const date = "2026-08-29";
    expect(utcDateToCalendarDate(calendarDateToUtcDate(date))).toBe(date);
  });

  it("ancora a data à meia-noite UTC", () => {
    expect(calendarDateToUtcDate("2026-08-29").toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });

  it("lê a data do banco pelos componentes UTC, não pelo relógio local", () => {
    // Rodando em UTC+14, `getDate()` local deste instante já é dia 29.
    // A leitura correta (UTC) precisa continuar sendo 28.
    const fromDb = new Date("2026-08-28T00:00:00.000Z");
    expect(utcDateToCalendarDate(fromDb)).toBe("2026-08-28");
  });

  it("lança em entrada inválida", () => {
    expect(() => assertCalendarDate("2026-02-30")).toThrow(TypeError);
  });
});

describe("aritmética civil", () => {
  it("soma e subtrai dias atravessando mês e ano", () => {
    expect(addDaysToCalendarDate("2026-08-29", 3)).toBe("2026-09-01");
    expect(addDaysToCalendarDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToCalendarDate("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysToCalendarDate("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysToCalendarDate("2026-08-29", 0)).toBe("2026-08-29");
  });

  it("calcula a diferença em dias", () => {
    expect(daysBetweenCalendarDates("2026-08-29", "2026-09-01")).toBe(3);
    expect(daysBetweenCalendarDates("2026-09-01", "2026-08-29")).toBe(-3);
    expect(daysBetweenCalendarDates("2026-08-29", "2026-08-29")).toBe(0);
  });

  it("atravessa uma transição de horário de verão sem perder um dia", () => {
    // Datas civis não têm horário, logo horário de verão é irrelevante.
    // Este teste existe para travar essa garantia.
    expect(daysBetweenCalendarDates("2026-11-01", "2026-11-02")).toBe(1);
    expect(addDaysToCalendarDate("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("ordena cronologicamente", () => {
    expect(compareCalendarDates("2026-08-29", "2026-09-01")).toBe(-1);
    expect(compareCalendarDates("2026-09-01", "2026-08-29")).toBe(1);
    expect(compareCalendarDates("2026-08-29", "2026-08-29")).toBe(0);
    expect(["2026-10-01", "2026-02-03", "2026-01-30"].sort(compareCalendarDates)).toEqual([
      "2026-01-30",
      "2026-02-03",
      "2026-10-01",
    ]);
  });
});

describe("formatCalendarDate", () => {
  it("formata sem deslocar o dia por timezone", () => {
    expect(formatCalendarDate("2026-08-29")).toBe("29 de ago.");
    expect(formatCalendarDate("2026-01-01", { day: "2-digit", month: "2-digit" })).toBe("01/01");
  });
});
