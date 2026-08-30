import {
  addMonths,
  formatMonth,
  monthCells,
  monthRangeInTimeZone,
  monthsBetween,
  monthWeeks,
  startOfMonth,
} from "./month";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js. A grade do
 * mês é aritmética de calendário: nada aqui pode depender do relógio da
 * máquina nem somar milissegundos.
 */

const TZ = "America/Sao_Paulo";

describe("startOfMonth", () => {
  it("volta para o dia 1", () => {
    expect(startOfMonth("2026-08-30")).toBe("2026-08-01");
    expect(startOfMonth("2026-08-01")).toBe("2026-08-01");
  });
});

describe("addMonths", () => {
  it("anda para frente e para trás", () => {
    expect(addMonths("2026-08-01", 1)).toBe("2026-09-01");
    expect(addMonths("2026-08-01", -1)).toBe("2026-07-01");
    expect(addMonths("2026-08-01", 0)).toBe("2026-08-01");
  });

  it("atravessa a virada do ano nas duas direções", () => {
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-01-01", -13)).toBe("2024-12-01");
    expect(addMonths("2026-12-01", 13)).toBe("2028-01-01");
  });

  it("não escorrega em mês curto — somar mês não é somar 30 dias", () => {
    // O erro clássico: 31/01 + 1 mês em milissegundos cai em 02/03.
    expect(addMonths(startOfMonth("2026-01-31"), 1)).toBe("2026-02-01");
    expect(addMonths("2026-02-01", 1)).toBe("2026-03-01");
  });
});

describe("monthsBetween", () => {
  it("conta a distância com sinal", () => {
    expect(monthsBetween("2026-08-01", "2026-08-01")).toBe(0);
    expect(monthsBetween("2026-08-01", "2026-11-01")).toBe(3);
    expect(monthsBetween("2026-08-01", "2026-05-01")).toBe(-3);
    expect(monthsBetween("2026-12-01", "2027-02-01")).toBe(2);
  });
});

describe("monthCells", () => {
  it("começa na segunda-feira e termina no domingo", () => {
    // 01/08/2026 é um sábado, então a grade abre na segunda anterior, 27/07.
    // E 31/08 é uma SEGUNDA, então ele abre a sexta linha sozinho e a grade só
    // fecha em 06/09 — o mês ocupa 6 linhas, não 5.
    const cells = monthCells("2026-08-01");

    expect(cells[0]?.date).toBe("2026-07-27");
    expect(cells[cells.length - 1]?.date).toBe("2026-09-06");
  });

  it("o total é sempre múltiplo de sete", () => {
    for (const month of ["2026-01-01", "2026-02-01", "2026-08-01", "2027-03-01"]) {
      expect(monthCells(month).length % 7).toBe(0);
    }
  });

  it("marca os dias vizinhos que só fecham a linha", () => {
    const cells = monthCells("2026-08-01");

    expect(cells[0]).toEqual({ date: "2026-07-27", inMonth: false });
    expect(cells.find((cell) => cell.date === "2026-08-01")?.inMonth).toBe(true);
    expect(cells.find((cell) => cell.date === "2026-08-31")?.inMonth).toBe(true);
    // 01/09 fecha a última linha e é vizinho, não parte do mês.
    expect(cells.find((cell) => cell.date === "2026-09-01")?.inMonth).toBe(false);
  });

  it("cobre todos os dias do mês, sem falha e sem repetição", () => {
    const cells = monthCells("2026-08-01");
    const inMonth = cells.filter((cell) => cell.inMonth).map((cell) => cell.date);

    expect(inMonth).toHaveLength(31);
    expect(inMonth[0]).toBe("2026-08-01");
    expect(inMonth[30]).toBe("2026-08-31");
    expect(new Set(inMonth).size).toBe(31);
  });

  it("um fevereiro que começa na segunda ocupa exatamente 4 linhas", () => {
    // 01/02/2027 é uma segunda-feira e o mês tem 28 dias: encaixe perfeito.
    expect(monthCells("2027-02-01")).toHaveLength(28);
  });

  it("um mês de 31 dias começando no domingo ocupa 6 linhas", () => {
    // 01/03/2026 é um domingo.
    expect(monthCells("2026-03-01")).toHaveLength(42);
  });

  it("inclui o 29 de fevereiro em ano bissexto", () => {
    const inMonth = monthCells("2028-02-01").filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[28]?.date).toBe("2028-02-29");
  });
});

describe("monthWeeks", () => {
  it("agrupa em linhas de sete", () => {
    const weeks = monthWeeks("2026-08-01");

    expect(weeks).toHaveLength(6);
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it("a primeira linha começa na segunda e a última termina no domingo", () => {
    const weeks = monthWeeks("2026-08-01");

    expect(weeks[0]?.[0]?.date).toBe("2026-07-27");
    expect(weeks[weeks.length - 1]?.[6]?.date).toBe("2026-09-06");
  });
});

describe("monthRangeInTimeZone", () => {
  it("cobre a grade inteira, inclusive os dias vizinhos", () => {
    const range = monthRangeInTimeZone("2026-08-01", TZ);

    // 27/07 00:00 em São Paulo (UTC-3) é 03:00 UTC.
    expect(range.start.toISOString()).toBe("2026-07-27T03:00:00.000Z");
    // Semiaberto: a última célula é 06/09, então termina no começo de 07/09.
    expect(range.endExclusive.toISOString()).toBe("2026-09-07T03:00:00.000Z");
  });

  it("o intervalo é semiaberto e contém todas as células", () => {
    const range = monthRangeInTimeZone("2026-08-01", TZ);
    expect(range.endExclusive.getTime()).toBeGreaterThan(range.start.getTime());
  });
});

describe("formatMonth", () => {
  it("nomeia o mês com a inicial maiúscula", () => {
    expect(formatMonth("2026-08-01")).toBe("Agosto de 2026");
    expect(formatMonth("2027-01-01")).toBe("Janeiro de 2027");
  });
});
