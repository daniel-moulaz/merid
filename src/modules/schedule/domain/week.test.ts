import { instantFrom, toCalendarDateInTimeZone } from "@/lib/time";

import {
  addWeeks,
  buildWeekWindow,
  dayLoadMinutes,
  DAYS_IN_WEEK,
  endOfWeek,
  formatWeekRange,
  segmentBlockByDay,
  startOfWeek,
  weekDays,
  weekHourMarks,
  weekRangeInTimeZone,
  WEEK_STARTS_ON,
} from "./week";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js. Qualquer
 * cálculo que escorregue para o relógio da máquina falha aqui.
 */

const TZ = "America/Sao_Paulo";

const block = (id: string, date: string, start: string, endDate: string, end: string) => ({
  id,
  startsAt: instantFrom(date, start, TZ),
  endsAt: instantFrom(endDate, end, TZ),
});

describe("início e fim da semana", () => {
  it("a semana começa na segunda-feira", () => {
    expect(WEEK_STARTS_ON).toBe(1);
  });

  it("de qualquer dia, chega na segunda daquela semana", () => {
    // 2026-08-29 é um sábado; a segunda é 24.
    expect(startOfWeek("2026-08-29")).toBe("2026-08-24");
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24");
    expect(startOfWeek("2026-08-30")).toBe("2026-08-24");
  });

  it("domingo pertence à semana que começou na segunda anterior", () => {
    // Domingo é o ÚLTIMO dia, não o primeiro — é o erro clássico do `% 7`.
    expect(startOfWeek("2026-08-30")).toBe("2026-08-24");
    expect(endOfWeek("2026-08-30")).toBe("2026-08-30");
  });

  it("o fim é o domingo, inclusivo", () => {
    expect(endOfWeek("2026-08-29")).toBe("2026-08-30");
  });

  it("aceita outro início de semana sem espalhar o número pelo código", () => {
    // Domingo como início: 2026-08-29 (sábado) pertence à semana do dia 23.
    expect(startOfWeek("2026-08-29", 0)).toBe("2026-08-23");
    expect(endOfWeek("2026-08-29", 0)).toBe("2026-08-29");
  });

  it("weekDays devolve sete dias consecutivos", () => {
    const days = weekDays("2026-08-24");

    expect(days).toHaveLength(DAYS_IN_WEEK);
    expect(days[0]).toBe("2026-08-24");
    expect(days[6]).toBe("2026-08-30");
  });

  it("atravessa a virada de MÊS", () => {
    // 2026-09-30 é uma quarta; a semana vai de 28/09 a 04/10.
    expect(startOfWeek("2026-09-30")).toBe("2026-09-28");
    expect(endOfWeek("2026-09-30")).toBe("2026-10-04");
  });

  it("atravessa a virada de ANO", () => {
    // 2027-01-01 é uma sexta; a semana começa em 28/12/2026.
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
    expect(endOfWeek("2027-01-01")).toBe("2027-01-03");
  });

  it("atravessa ano bissexto sem perder um dia", () => {
    // 2028 é bissexto: 29 de fevereiro existe.
    const days = weekDays(startOfWeek("2028-03-01"));
    expect(days).toContain("2028-02-29");
    expect(days).toHaveLength(DAYS_IN_WEEK);
  });

  it("addWeeks anda de sete em sete, inclusive sobre a virada de ano", () => {
    expect(addWeeks("2026-08-24", 1)).toBe("2026-08-31");
    expect(addWeeks("2026-08-24", -1)).toBe("2026-08-17");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
  });
});

describe("formatWeekRange", () => {
  it("mesma quinzena do mesmo mês: nomeia o mês uma vez", () => {
    expect(formatWeekRange("2026-08-24")).toBe("24 – 30 de agosto");
  });

  it("meses diferentes, mesmo ano", () => {
    expect(formatWeekRange("2026-09-28")).toContain("set");
    expect(formatWeekRange("2026-09-28")).toContain("out");
  });

  it("anos diferentes: mostra o ano nos dois lados", () => {
    const label = formatWeekRange("2026-12-28");

    expect(label).toContain("2026");
    expect(label).toContain("2027");
  });

  it("nunca produz um rótulo vazio ou com separador solto", () => {
    for (const start of ["2026-01-05", "2026-06-29", "2026-12-28", "2028-02-28"]) {
      const label = formatWeekRange(start);
      expect(label.trim().length).toBeGreaterThan(5);
      expect(label).not.toMatch(/–\s*$/);
    }
  });
});

describe("weekRangeInTimeZone", () => {
  it("cobre da meia-noite de segunda à meia-noite da segunda seguinte", () => {
    const range = weekRangeInTimeZone("2026-08-24", TZ);

    // São Paulo é UTC-3.
    expect(range.start.toISOString()).toBe("2026-08-24T03:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-08-31T03:00:00.000Z");
  });

  it("o intervalo é semiaberto: a segunda seguinte já não pertence", () => {
    const range = weekRangeInTimeZone("2026-08-24", TZ);
    const nextMonday = instantFrom("2026-08-31", "00:00", TZ);

    expect(range.endExclusive.getTime()).toBe(nextMonday.getTime());
  });

  it("uma semana com transição de horário de verão NÃO tem 168 horas", () => {
    // Nova York adianta o relógio no domingo 08/03/2026: a semana perde 1 h.
    const range = weekRangeInTimeZone("2026-03-02", "America/New_York");
    const hours = (range.endExclusive.getTime() - range.start.getTime()) / 3_600_000;

    expect(hours).toBe(167);
  });

  it("uma semana de volta do horário de verão tem 169 horas", () => {
    // Nova York atrasa o relógio no domingo 01/11/2026.
    const range = weekRangeInTimeZone("2026-10-26", "America/New_York");
    const hours = (range.endExclusive.getTime() - range.start.getTime()) / 3_600_000;

    expect(hours).toBe(169);
  });

  it("o mesmo intervalo civil em fusos diferentes são instantes diferentes", () => {
    const saoPaulo = weekRangeInTimeZone("2026-08-24", TZ);
    const tokyo = weekRangeInTimeZone("2026-08-24", "Asia/Tokyo");

    expect(saoPaulo.start.getTime()).not.toBe(tokyo.start.getTime());
  });
});

describe("segmentBlockByDay — bloco dentro de um dia", () => {
  it("produz um único segmento com os minutos do relógio", () => {
    const segments = segmentBlockByDay(
      block("a", "2026-08-26", "14:00", "2026-08-26", "15:30"),
      TZ,
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      blockId: "a",
      date: "2026-08-26",
      startMinute: 14 * 60,
      endMinute: 15 * 60 + 30,
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it("um bloco de madrugada não vira dois segmentos", () => {
    const segments = segmentBlockByDay(
      block("a", "2026-08-26", "00:00", "2026-08-26", "01:00"),
      TZ,
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.startMinute).toBe(0);
  });

  it("o segmento é lido no FUSO DO USUÁRIO, não no da máquina", () => {
    const segments = segmentBlockByDay(
      block("a", "2026-08-26", "14:00", "2026-08-26", "15:00"),
      TZ,
    );
    const inUtc = segmentBlockByDay(
      block("a", "2026-08-26", "14:00", "2026-08-26", "15:00"),
      "UTC",
    );

    expect(segments[0]?.startMinute).toBe(14 * 60);
    // O MESMO instante, lido em UTC, cai às 17:00.
    expect(inUtc[0]?.startMinute).toBe(17 * 60);
  });
});

describe("segmentBlockByDay — bloco atravessando a meia-noite", () => {
  const crossing = block("noturno", "2026-08-26", "23:00", "2026-08-27", "01:00");

  it("vira DOIS segmentos, um em cada dia", () => {
    const segments = segmentBlockByDay(crossing, TZ);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      date: "2026-08-26",
      startMinute: 23 * 60,
      endMinute: 1440,
      continuesBefore: false,
      continuesAfter: true,
    });
    expect(segments[1]).toMatchObject({
      date: "2026-08-27",
      startMinute: 0,
      endMinute: 60,
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it("os dois segmentos apontam para o MESMO ScheduleBlock", () => {
    const segments = segmentBlockByDay(crossing, TZ);

    expect(segments.every((segment) => segment.blockId === "noturno")).toBe(true);
    // Os ids de apresentação são distintos para servirem de chave de lista.
    expect(new Set(segments.map((s) => s.id)).size).toBe(2);
  });

  it("a soma dos segmentos é a duração total do bloco", () => {
    const total = segmentBlockByDay(crossing, TZ).reduce(
      (sum, segment) => sum + (segment.endMinute - segment.startMinute),
      0,
    );

    expect(total).toBe(120);
  });

  it("fim exatamente à meia-noite fecha o dia anterior às 24:00, sem segmento vazio", () => {
    const segments = segmentBlockByDay(
      block("a", "2026-08-26", "23:00", "2026-08-27", "00:00"),
      TZ,
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      date: "2026-08-26",
      endMinute: 1440,
      continuesAfter: false,
    });
  });

  it("bloco de 24 h cobre um dia inteiro e um instante do seguinte", () => {
    const segments = segmentBlockByDay(
      block("a", "2026-08-26", "10:00", "2026-08-27", "10:00"),
      TZ,
    );

    expect(segments.map((s) => s.date)).toEqual(["2026-08-26", "2026-08-27"]);
    expect(segments[0]?.endMinute).toBe(1440);
    expect(segments[1]?.endMinute).toBe(10 * 60);
  });
});

describe("segmentBlockByDay — fronteira da semana", () => {
  it("domingo 23:30 → segunda 00:30 cai nas duas semanas", () => {
    // 2026-08-30 é o último dia da semana que começou em 24/08.
    const crossing = block("virada", "2026-08-30", "23:30", "2026-08-31", "00:30");
    const segments = segmentBlockByDay(crossing, TZ);

    expect(segments.map((s) => s.date)).toEqual(["2026-08-30", "2026-08-31"]);

    // Um dia pertence à semana corrente, o outro à seguinte.
    expect(startOfWeek(segments[0]!.date)).toBe("2026-08-24");
    expect(startOfWeek(segments[1]!.date)).toBe("2026-08-31");
  });
});

describe("segmentBlockByDay — horário de verão", () => {
  const NY = "America/New_York";

  it("um bloco em dia normal continua com a duração do relógio", () => {
    const segments = segmentBlockByDay(
      block("a", "2026-03-02", "14:00", "2026-03-02", "16:00"),
      NY,
    );

    expect(segments[0]?.endMinute! - segments[0]?.startMinute!).toBe(120);
  });

  it("no dia em que o relógio adianta, a grade usa a hora do RELÓGIO", () => {
    // 08/03/2026 em Nova York: 02:00 não existe. Um bloco 01:30 → 03:30 dura
    // uma hora real, e ocupa duas horas de grade — a distorção documentada em
    // `week.ts`, consequência de a régua semanal ser um relógio.
    const dstBlock = {
      id: "dst",
      startsAt: instantFrom("2026-03-08", "01:30", NY),
      endsAt: instantFrom("2026-03-08", "03:30", NY),
    };
    const realMinutes =
      (dstBlock.endsAt.getTime() - dstBlock.startsAt.getTime()) / 60_000;

    const segments = segmentBlockByDay(dstBlock, NY);

    expect(realMinutes).toBe(60);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.startMinute).toBe(90);
    expect(segments[0]?.endMinute).toBe(210);
  });

  it("o dia do bloco continua sendo o dia civil do usuário", () => {
    const dstBlock = {
      id: "dst",
      startsAt: instantFrom("2026-03-08", "01:30", NY),
      endsAt: instantFrom("2026-03-08", "03:30", NY),
    };

    expect(segmentBlockByDay(dstBlock, NY)[0]?.date).toBe(
      toCalendarDateInTimeZone(dstBlock.startsAt, NY),
    );
  });
});

describe("buildWeekWindow", () => {
  const segment = (date: string, startMinute: number, endMinute: number) => ({
    id: `${date}-${startMinute}`,
    blockId: "b",
    date,
    startMinute,
    endMinute,
    continuesBefore: false,
    continuesAfter: false,
  });

  it("abre na faixa útil padrão", () => {
    const window = buildWeekWindow([]);

    expect(window.startMinute).toBe(6 * 60);
    expect(window.endMinute).toBe(23 * 60);
    expect(window.totalMinutes).toBe(17 * 60);
  });

  it("segmentos dentro da faixa não a alteram", () => {
    const window = buildWeekWindow([segment("2026-08-24", 9 * 60, 10 * 60)]);

    expect(window.startMinute).toBe(6 * 60);
    expect(window.endMinute).toBe(23 * 60);
  });

  it("expande para cima até a hora cheia anterior", () => {
    const window = buildWeekWindow([segment("2026-08-24", 4 * 60 + 20, 5 * 60)]);

    expect(window.startMinute).toBe(4 * 60);
  });

  it("expande para baixo até a hora cheia seguinte", () => {
    const window = buildWeekWindow([segment("2026-08-24", 23 * 60, 23 * 60 + 40)]);

    expect(window.endMinute).toBe(24 * 60);
  });

  it("nenhum bloco fica fora da grade: a madrugada aparece se for usada", () => {
    const window = buildWeekWindow([segment("2026-08-24", 0, 60)]);

    expect(window.startMinute).toBe(0);
  });

  it("nunca ultrapassa as 24 horas do relógio", () => {
    const window = buildWeekWindow([segment("2026-08-24", 0, 1440)]);

    expect(window.startMinute).toBe(0);
    expect(window.endMinute).toBe(1440);
  });
});

describe("weekHourMarks", () => {
  it("gera uma marca por hora cheia da janela", () => {
    const marks = weekHourMarks({ startMinute: 6 * 60, endMinute: 9 * 60, totalMinutes: 180 });

    expect(marks).toEqual([360, 420, 480, 540]);
  });
});

describe("dayLoadMinutes", () => {
  const segments = [
    { id: "1", blockId: "a", date: "2026-08-24", startMinute: 540, endMinute: 630, continuesBefore: false, continuesAfter: false },
    { id: "2", blockId: "b", date: "2026-08-24", startMinute: 840, endMinute: 900, continuesBefore: false, continuesAfter: false },
    { id: "3", blockId: "c", date: "2026-08-25", startMinute: 600, endMinute: 660, continuesBefore: false, continuesAfter: false },
  ];

  it("soma apenas os segmentos do dia pedido", () => {
    expect(dayLoadMinutes(segments, "2026-08-24")).toBe(150);
    expect(dayLoadMinutes(segments, "2026-08-25")).toBe(60);
  });

  it("dia sem segmento soma zero", () => {
    expect(dayLoadMinutes(segments, "2026-08-26")).toBe(0);
  });

  it("conta só a parte VISÍVEL de um bloco que atravessa a meia-noite", () => {
    const crossing = segmentBlockByDay(
      block("noturno", "2026-08-26", "23:00", "2026-08-27", "01:00"),
      TZ,
    );

    expect(dayLoadMinutes(crossing, "2026-08-26")).toBe(60);
    expect(dayLoadMinutes(crossing, "2026-08-27")).toBe(60);
  });
});
