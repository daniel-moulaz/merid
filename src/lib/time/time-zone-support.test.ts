import { detectTimeZoneSupport } from "./time-zone-support";

describe("detectTimeZoneSupport", () => {
  it("reconhece o runtime de teste como suportado", () => {
    expect(detectTimeZoneSupport()).toEqual({ supported: true });
  });

  it("detecta ausência de Intl.DateTimeFormat", () => {
    const original = Intl.DateTimeFormat;
    // @ts-expect-error remoção proposital para simular um runtime sem Intl
    delete Intl.DateTimeFormat;

    try {
      const result = detectTimeZoneSupport();
      expect(result.supported).toBe(false);
    } finally {
      Intl.DateTimeFormat = original;
    }
  });

  it("detecta motor que ignora a timezone pedida", () => {
    const original = Intl.DateTimeFormat;
    // Simula um Hermes sem ICU: aceita a opção mas formata sempre em UTC.
    const fake = function (locale?: string, options?: Intl.DateTimeFormatOptions) {
      return new original(locale, { ...options, timeZone: "UTC" });
    } as unknown as typeof Intl.DateTimeFormat;
    Intl.DateTimeFormat = fake;

    try {
      const result = detectTimeZoneSupport();
      expect(result.supported).toBe(false);
      expect(result.supported === false && result.reason).toContain("2026-08-28");
    } finally {
      Intl.DateTimeFormat = original;
    }
  });
});
