import { toCalendarDateInTimeZone } from "@/lib/time";
import { startOfWeek } from "@/modules/schedule/domain/week";

import { indexActivityByDate, type DayActivity } from "./activity";
import {
  buildHeatmapRange,
  buildHeatmapWeeks,
  datesOf,
  heatmapInstantRange,
  monthLabels,
  HEATMAP_HISTORY_WEEKS,
} from "./heatmap";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js. Um cálculo
 * que escorregue para o relógio da máquina falha aqui.
 */

const TZ = "America/Sao_Paulo";
/** Sábado. A semana correspondente abre na segunda, 2026-08-24. */
const TODAY = "2026-08-29";

const day = (date: string, minutes: number, tasks = 1): DayActivity => ({ date, minutes, tasks });

describe("buildHeatmapRange", () => {
  it("termina no domingo que fecha a semana de hoje", () => {
    expect(buildHeatmapRange(TODAY, 4).to).toBe("2026-08-30");
  });

  it("começa numa segunda-feira", () => {
    const { from } = buildHeatmapRange(TODAY, 4);
    expect(from).toBe(startOfWeek(from));
    expect(from).toBe("2026-08-03");
  });

  it("cobre exatamente o número de semanas pedido", () => {
    const { from, to } = buildHeatmapRange(TODAY, 4);
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    expect(days + 1).toBe(4 * 7);
  });

  it("a janela padrão cobre doze meses", () => {
    const { from, to } = buildHeatmapRange(TODAY);
    expect(HEATMAP_HISTORY_WEEKS).toBe(53);
    expect(from).toBe("2025-08-25");
    expect(to).toBe("2026-08-30");
  });
});

describe("heatmapInstantRange", () => {
  it("cobre o dia civil inteiro no fuso do usuário", () => {
    const range = heatmapInstantRange(TODAY, TZ, 1);

    // A janela de uma semana vai de segunda 00:00 a segunda seguinte 00:00.
    expect(toCalendarDateInTimeZone(range.start, TZ)).toBe("2026-08-24");
    expect(range.start.toISOString()).toBe("2026-08-24T03:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-08-31T03:00:00.000Z");
  });

  it("uma janela com horário de verão não ganha nem perde uma hora", () => {
    // Em Nova York, 2027-03-14 adianta o relógio: a semana tem 167 horas.
    const range = heatmapInstantRange("2027-03-14", "America/New_York", 1);
    const hours = (range.endExclusive.getTime() - range.start.getTime()) / 3_600_000;
    expect(hours).toBe(167);
  });
});

describe("buildHeatmapWeeks", () => {
  const activity = indexActivityByDate([
    day("2026-08-24", 45, 2),
    day("2026-08-26", 150, 4),
    day("2026-08-29", 20, 1),
  ]);

  const weeks = buildHeatmapWeeks({ today: TODAY, weeks: 2, activity });

  it("devolve o número de semanas pedido, com sete dias cada", () => {
    expect(weeks).toHaveLength(2);
    for (const week of weeks) {
      expect(week.days).toHaveLength(7);
    }
  });

  it("a última semana é a de hoje, inteira", () => {
    const last = weeks[1];
    expect(last?.start).toBe("2026-08-24");
    expect(last?.days.at(0)?.date).toBe("2026-08-24");
    expect(last?.days.at(6)?.date).toBe("2026-08-30");
  });

  it("preenche minutos, tarefas e nível a partir da atividade", () => {
    const monday = weeks[1]?.days.at(0);
    expect(monday).toMatchObject({ date: "2026-08-24", minutes: 45, tasks: 2, level: 2 });

    const wednesday = weeks[1]?.days.at(2);
    expect(wednesday).toMatchObject({ date: "2026-08-26", minutes: 150, tasks: 4, level: 4 });
  });

  it("dia sem registro vira zero, e não buraco", () => {
    expect(weeks[1]?.days.at(1)).toMatchObject({ date: "2026-08-25", minutes: 0, level: 0 });
  });

  it("marca hoje exatamente uma vez em toda a grade", () => {
    const flagged = weeks.flatMap((week) => week.days).filter((cell) => cell.isToday);
    expect(flagged.map((cell) => cell.date)).toEqual([TODAY]);
    expect(weeks[1]?.days.at(5)).toMatchObject({ date: TODAY, isToday: true, isFuture: false });
  });

  it("distingue futuro de vazio", () => {
    // Domingo 30 ainda não chegou: é futuro, não um dia sem trabalho.
    expect(weeks[1]?.days.at(6)).toMatchObject({
      date: "2026-08-30",
      minutes: 0,
      isFuture: true,
    });
    // Terça 25 passou sem conclusão: aí sim é vazio.
    expect(weeks[1]?.days.at(1)).toMatchObject({ date: "2026-08-25", isFuture: false });
  });

  it("hoje nunca é futuro", () => {
    const single = buildHeatmapWeeks({ today: TODAY, weeks: 1, activity });
    expect(single[0]?.days.some((cell) => cell.isToday && cell.isFuture)).toBe(false);
  });

  it("as datas são contíguas e sem repetição", () => {
    const dates = datesOf(buildHeatmapWeeks({ today: TODAY, weeks: 8, activity }));
    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });

  it("atravessa a virada de ano sem perder dias", () => {
    const dates = datesOf(
      buildHeatmapWeeks({ today: "2027-01-05", weeks: 3, activity: indexActivityByDate([]) }),
    );
    expect(dates).toContain("2026-12-31");
    expect(dates).toContain("2027-01-01");
    expect(dates).toHaveLength(21);
  });
});

describe("monthLabels", () => {
  it("marca cada mês uma única vez", () => {
    const weeks = buildHeatmapWeeks({
      today: TODAY,
      weeks: 12,
      activity: indexActivityByDate([]),
    });
    const labels = monthLabels(weeks);

    expect(new Set(labels.map((entry) => entry.label)).size).toBe(labels.length);
    expect(labels.length).toBeGreaterThan(0);
  });

  it("não rotula a primeira semana, que abriria o eixo com dois meses colados", () => {
    const weeks = buildHeatmapWeeks({
      today: TODAY,
      weeks: 12,
      activity: indexActivityByDate([]),
    });
    expect(monthLabels(weeks).every((entry) => entry.weekIndex > 0)).toBe(true);
  });

  it("os índices apontam para semanas existentes, em ordem", () => {
    const weeks = buildHeatmapWeeks({
      today: TODAY,
      weeks: 20,
      activity: indexActivityByDate([]),
    });
    const labels = monthLabels(weeks);

    for (const entry of labels) {
      expect(entry.weekIndex).toBeLessThan(weeks.length);
    }
    expect(labels.map((entry) => entry.weekIndex)).toEqual(
      [...labels.map((entry) => entry.weekIndex)].sort((a, b) => a - b),
    );
  });
});
