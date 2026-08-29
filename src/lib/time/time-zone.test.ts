import { minutesBetween } from "./duration";
import {
  calendarRangeInTimeZone,
  dayRangeInTimeZone,
  isValidTimeZone,
  startOfDayInTimeZone,
  toCalendarDateInTimeZone,
  todayInTimeZone,
} from "./time-zone";

const SAO_PAULO = "America/Sao_Paulo";
const NEW_YORK = "America/New_York";
const SANTIAGO = "America/Santiago";
const TOKYO = "Asia/Tokyo";

describe("isValidTimeZone", () => {
  it("aceita zonas IANA e rejeita lixo", () => {
    expect(isValidTimeZone(SAO_PAULO)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("America/Sao Paulo")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("toCalendarDateInTimeZone", () => {
  it("resolve o dia do usuário, não o dia UTC", () => {
    // 02:30 UTC = 23:30 do dia ANTERIOR em São Paulo (UTC-3).
    const instant = new Date("2026-08-29T02:30:00.000Z");

    expect(toCalendarDateInTimeZone(instant, SAO_PAULO)).toBe("2026-08-28");
    expect(toCalendarDateInTimeZone(instant, "UTC")).toBe("2026-08-29");
    expect(toCalendarDateInTimeZone(instant, TOKYO)).toBe("2026-08-29");
  });

  it("resolve o dia seguinte para zonas à frente do UTC", () => {
    // 22:00 UTC = 07:00 do dia seguinte em Tóquio (UTC+9).
    const instant = new Date("2026-08-29T22:00:00.000Z");

    expect(toCalendarDateInTimeZone(instant, TOKYO)).toBe("2026-08-30");
    expect(toCalendarDateInTimeZone(instant, SAO_PAULO)).toBe("2026-08-29");
  });

  it("todayInTimeZone usa o `now` injetado", () => {
    const now = new Date("2026-01-01T02:00:00.000Z");
    expect(todayInTimeZone(SAO_PAULO, now)).toBe("2025-12-31");
    expect(todayInTimeZone("UTC", now)).toBe("2026-01-01");
  });
});

describe("startOfDayInTimeZone", () => {
  it("retorna a meia-noite local como instante UTC", () => {
    expect(startOfDayInTimeZone("2026-08-29", SAO_PAULO).toISOString()).toBe(
      "2026-08-29T03:00:00.000Z",
    );
    expect(startOfDayInTimeZone("2026-08-29", "UTC").toISOString()).toBe(
      "2026-08-29T00:00:00.000Z",
    );
  });

  it("retorna um Date puro (não um TZDate que serializa com offset)", () => {
    const start = startOfDayInTimeZone("2026-08-29", SAO_PAULO);
    expect(start.constructor).toBe(Date);
    expect(start.toISOString()).toMatch(/Z$/);
  });

  it("no dia em que a meia-noite não existe, usa o primeiro instante do dia", () => {
    // No Chile o horário de verão começa pulando 00:00 -> 01:00.
    const start = startOfDayInTimeZone("2026-09-06", SANTIAGO);

    expect(toCalendarDateInTimeZone(start, SANTIAGO)).toBe("2026-09-06");
    const localHour = new Intl.DateTimeFormat("en-US", {
      timeZone: SANTIAGO,
      hour: "2-digit",
      hour12: false,
    }).format(start);
    expect(Number(localHour)).toBe(1);
  });
});

describe("dayRangeInTimeZone", () => {
  it("produz um intervalo semiaberto que encosta no dia seguinte", () => {
    const range = dayRangeInTimeZone("2026-08-29", SAO_PAULO);

    expect(range.start.toISOString()).toBe("2026-08-29T03:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-08-30T03:00:00.000Z");
    expect(range.endExclusive).toEqual(dayRangeInTimeZone("2026-08-30", SAO_PAULO).start);
  });

  it("um dia normal tem 24 horas", () => {
    const range = dayRangeInTimeZone("2026-08-29", NEW_YORK);
    expect(minutesBetween(range.start, range.endExclusive)).toBe(24 * 60);
  });

  it("o dia de entrada do horário de verão tem 23 horas", () => {
    const range = dayRangeInTimeZone("2026-03-08", NEW_YORK);
    expect(minutesBetween(range.start, range.endExclusive)).toBe(23 * 60);
  });

  it("o dia de saída do horário de verão tem 25 horas", () => {
    const range = dayRangeInTimeZone("2026-11-01", NEW_YORK);
    expect(minutesBetween(range.start, range.endExclusive)).toBe(25 * 60);
  });
});

describe("calendarRangeInTimeZone", () => {
  it("cobre do início do primeiro dia ao início do dia seguinte ao último", () => {
    const range = calendarRangeInTimeZone("2026-08-24", "2026-08-30", SAO_PAULO);

    expect(range.start.toISOString()).toBe("2026-08-24T03:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-08-31T03:00:00.000Z");
  });

  it("um único dia produz o mesmo intervalo de dayRange", () => {
    expect(calendarRangeInTimeZone("2026-08-29", "2026-08-29", SAO_PAULO)).toEqual(
      dayRangeInTimeZone("2026-08-29", SAO_PAULO),
    );
  });
});
