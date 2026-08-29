import {
  addMinutesToTimeOfDay,
  assertTimeOfDay,
  ceilTimeOfDayToStep,
  formatTimeRangeInTimeZone,
  instantFrom,
  isTimeOfDay,
  minutesToTimeOfDay,
  timeOfDayInTimeZone,
  timeOfDayToMinutes,
} from "./time-of-day";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js. Qualquer
 * conversão que use acidentalmente o relógio da máquina falha aqui.
 */

describe("isTimeOfDay", () => {
  it.each(["00:00", "09:05", "13:59", "23:59"])("aceita %s", (value) => {
    expect(isTimeOfDay(value)).toBe(true);
  });

  it.each([
    "24:00", // hora inexistente
    "23:60", // minuto inexistente
    "9:05", // sem zero à esquerda
    "09:5",
    "09:05:00", // com segundos
    "0905",
    "",
    " 09:05",
  ])("rejeita %p", (value) => {
    expect(isTimeOfDay(value)).toBe(false);
  });

  it("rejeita valores que não são string", () => {
    for (const value of [null, undefined, 905, new Date(), {}]) {
      expect(isTimeOfDay(value)).toBe(false);
    }
  });

  it("assertTimeOfDay lança em valor inválido", () => {
    expect(() => assertTimeOfDay("24:00")).toThrow(TypeError);
  });
});

describe("conversão entre horário e minutos", () => {
  it.each([
    ["00:00", 0],
    ["00:01", 1],
    ["01:00", 60],
    ["09:30", 570],
    ["14:30", 870],
    ["23:59", 1439],
  ])("%s <-> %i minutos", (time, minutes) => {
    expect(timeOfDayToMinutes(time)).toBe(minutes);
    expect(minutesToTimeOfDay(minutes)).toBe(time);
  });

  it("dá a volta no relógio para valores fora do dia", () => {
    expect(minutesToTimeOfDay(1440)).toBe("00:00");
    expect(minutesToTimeOfDay(1470)).toBe("00:30");
    expect(minutesToTimeOfDay(-30)).toBe("23:30");
    expect(minutesToTimeOfDay(-1440)).toBe("00:00");
  });

  it("recusa minuto fracionário", () => {
    expect(() => minutesToTimeOfDay(10.5)).toThrow(TypeError);
  });
});

describe("addMinutesToTimeOfDay", () => {
  it("soma dentro do mesmo dia", () => {
    expect(addMinutesToTimeOfDay("14:00", 90)).toBe("15:30");
  });

  it("atravessa a meia-noite", () => {
    expect(addMinutesToTimeOfDay("23:30", 60)).toBe("00:30");
  });

  it("subtrai atravessando a meia-noite para trás", () => {
    expect(addMinutesToTimeOfDay("00:15", -30)).toBe("23:45");
  });

  it("somar zero é identidade", () => {
    expect(addMinutesToTimeOfDay("07:07", 0)).toBe("07:07");
  });
});

describe("ceilTimeOfDayToStep", () => {
  it("arredonda para cima no passo de 15 minutos", () => {
    expect(ceilTimeOfDayToStep("14:01", 15)).toBe("14:15");
    expect(ceilTimeOfDayToStep("14:14", 15)).toBe("14:15");
    expect(ceilTimeOfDayToStep("14:16", 15)).toBe("14:30");
  });

  it("mantém horário já alinhado", () => {
    expect(ceilTimeOfDayToStep("14:30", 15)).toBe("14:30");
  });

  it("arredonda para 00:00 quando passa da meia-noite", () => {
    expect(ceilTimeOfDayToStep("23:50", 15)).toBe("00:00");
  });

  it("recusa passo inválido", () => {
    expect(() => ceilTimeOfDayToStep("14:00", 0)).toThrow(TypeError);
    expect(() => ceilTimeOfDayToStep("14:00", -15)).toThrow(TypeError);
  });
});

describe("instantFrom — dia + horário + timezone viram um instante", () => {
  it("resolve o offset de São Paulo (UTC-3)", () => {
    const instant = instantFrom("2026-08-29", "14:00", "America/Sao_Paulo");
    expect(instant.toISOString()).toBe("2026-08-29T17:00:00.000Z");
  });

  it("resolve o offset de Tóquio (UTC+9)", () => {
    const instant = instantFrom("2026-08-29", "09:00", "Asia/Tokyo");
    expect(instant.toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });

  it("o MESMO horário civil em fusos diferentes é um instante diferente", () => {
    const saoPaulo = instantFrom("2026-08-29", "14:00", "America/Sao_Paulo");
    const lisbon = instantFrom("2026-08-29", "14:00", "Europe/Lisbon");

    expect(saoPaulo.getTime()).not.toBe(lisbon.getTime());
    // São Paulo (UTC-3) acontece 4h depois de Lisboa (UTC+1 no verão).
    expect(saoPaulo.getTime() - lisbon.getTime()).toBe(4 * 60 * 60_000);
  });

  it("meia-noite civil não vira o dia anterior nem o seguinte", () => {
    const instant = instantFrom("2026-08-29", "00:00", "America/Sao_Paulo");
    expect(timeOfDayInTimeZone(instant, "America/Sao_Paulo")).toBe("00:00");
  });

  it("não é afetado pelo relógio da máquina (UTC+14 nesta suíte)", () => {
    const instant = instantFrom("2026-08-29", "14:00", "America/Sao_Paulo");
    // Se a conversão usasse o fuso local, o resultado seria 2026-08-29T00:00Z.
    expect(instant.toISOString()).not.toBe("2026-08-29T00:00:00.000Z");
  });

  it("aplica o offset de INVERNO em data de inverno do hemisfério norte", () => {
    // Nova York: UTC-5 em janeiro, UTC-4 em julho. O mesmo horário civil tem
    // offsets diferentes — é exatamente por isso que somar offset fixo é bug.
    const winter = instantFrom("2026-01-15", "12:00", "America/New_York");
    const summer = instantFrom("2026-07-15", "12:00", "America/New_York");

    expect(winter.toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("rejeita entradas inválidas", () => {
    expect(() => instantFrom("2026-02-30", "14:00", "America/Sao_Paulo")).toThrow(TypeError);
    expect(() => instantFrom("2026-08-29", "24:00", "America/Sao_Paulo")).toThrow(TypeError);
    expect(() => instantFrom("2026-08-29", "14:00", "Marte/Olympus")).toThrow(TypeError);
  });
});

describe("timeOfDayInTimeZone — instante volta a ser horário do usuário", () => {
  it("apresenta o instante no fuso do usuário", () => {
    const instant = new Date("2026-08-29T17:00:00.000Z");
    expect(timeOfDayInTimeZone(instant, "America/Sao_Paulo")).toBe("14:00");
    expect(timeOfDayInTimeZone(instant, "UTC")).toBe("17:00");
    expect(timeOfDayInTimeZone(instant, "Asia/Tokyo")).toBe("02:00");
  });

  it("formata meia-noite como 00:00 e nunca 24:00", () => {
    const instant = new Date("2026-08-29T03:00:00.000Z");
    expect(timeOfDayInTimeZone(instant, "America/Sao_Paulo")).toBe("00:00");
  });

  it("faz round-trip com instantFrom em horários variados", () => {
    for (const time of ["00:00", "06:15", "12:00", "14:30", "23:45"]) {
      const instant = instantFrom("2026-08-29", time, "America/Sao_Paulo");
      expect(timeOfDayInTimeZone(instant, "America/Sao_Paulo")).toBe(time);
    }
  });
});

describe("formatTimeRangeInTimeZone", () => {
  it("apresenta o intervalo no fuso do usuário", () => {
    const start = instantFrom("2026-08-29", "14:00", "America/Sao_Paulo");
    const end = instantFrom("2026-08-29", "15:30", "America/Sao_Paulo");

    expect(formatTimeRangeInTimeZone(start, end, "America/Sao_Paulo")).toBe("14:00 → 15:30");
    // O MESMO bloco, lido de outro fuso, mostra outras horas — e está certo.
    expect(formatTimeRangeInTimeZone(start, end, "UTC")).toBe("17:00 → 18:30");
  });
});
