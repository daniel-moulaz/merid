import { formatMinutes, minutesBetween } from "./duration";

describe("formatMinutes", () => {
  it("formata durações abaixo de uma hora", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(10)).toBe("10 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(59)).toBe("59 min");
  });

  it("formata horas cheias sem minutos", () => {
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(120)).toBe("2h");
  });

  it("formata horas com minutos com dois dígitos", () => {
    expect(formatMinutes(90)).toBe("1h30");
    expect(formatMinutes(65)).toBe("1h05");
    expect(formatMinutes(1439)).toBe("23h59");
  });

  it("rejeita entradas inválidas", () => {
    expect(() => formatMinutes(-1)).toThrow(TypeError);
    expect(() => formatMinutes(1.5)).toThrow(TypeError);
  });
});

describe("minutesBetween", () => {
  it("calcula a duração de um bloco", () => {
    expect(
      minutesBetween(new Date("2026-08-29T17:00:00Z"), new Date("2026-08-29T18:30:00Z")),
    ).toBe(90);
  });

  it("conta o tempo real quando o bloco atravessa mudança de horário de verão", () => {
    // 01:30 -> 03:30 local em Nova York na entrada do horário de verão:
    // no relógio parecem 2h, no tempo real é 1h.
    expect(
      minutesBetween(new Date("2026-03-08T06:30:00Z"), new Date("2026-03-08T07:30:00Z")),
    ).toBe(60);
  });
});
