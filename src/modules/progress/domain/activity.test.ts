import {
  activityLevel,
  activityLevelLabel,
  indexActivityByDate,
  totalsFor,
  type DayActivity,
} from "./activity";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js. Nada aqui
 * pode depender do relógio da máquina.
 */

const day = (date: string, minutes: number, tasks: number): DayActivity => ({
  date,
  minutes,
  tasks,
});

describe("activityLevel", () => {
  it("dia sem conclusão é nível 0", () => {
    expect(activityLevel(0)).toBe(0);
  });

  it("um único minuto já acende a célula", () => {
    // Regra de produto, não detalhe: um dia leve não pode parecer um dia vazio.
    expect(activityLevel(1)).toBe(1);
  });

  it("respeita as bordas de cada faixa", () => {
    expect(activityLevel(29)).toBe(1);
    expect(activityLevel(30)).toBe(2);
    expect(activityLevel(59)).toBe(2);
    expect(activityLevel(60)).toBe(3);
    expect(activityLevel(119)).toBe(3);
    expect(activityLevel(120)).toBe(4);
  });

  it("satura no topo em vez de crescer sem fim", () => {
    // É isto que absorve o pico de concluir uma tarefa de 4 h de uma vez.
    expect(activityLevel(240)).toBe(4);
    expect(activityLevel(1440)).toBe(4);
  });

  it("é monotônico: mais minutos nunca baixam o nível", () => {
    let previous = activityLevel(0);
    for (let minutes = 1; minutes <= 300; minutes += 1) {
      const level = activityLevel(minutes);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it("todo nível tem rótulo legível", () => {
    for (const level of [0, 1, 2, 3, 4] as const) {
      expect(activityLevelLabel(level).length).toBeGreaterThan(0);
    }
  });
});

describe("totalsFor", () => {
  const activity = indexActivityByDate([
    day("2026-08-24", 90, 2),
    day("2026-08-26", 30, 1),
    day("2026-08-29", 120, 3),
  ]);

  it("soma minutos, tarefas e dias ativos", () => {
    const dates = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27"];
    expect(totalsFor(dates, activity)).toEqual({ minutes: 120, tasks: 3, activeDays: 2 });
  });

  it("período sem atividade zera tudo sem quebrar", () => {
    expect(totalsFor(["2026-09-01", "2026-09-02"], activity)).toEqual({
      minutes: 0,
      tasks: 0,
      activeDays: 0,
    });
  });

  it("lista vazia é zero", () => {
    expect(totalsFor([], activity)).toEqual({ minutes: 0, tasks: 0, activeDays: 0 });
  });

  it("não conta como dia ativo um dia registrado com zero minutos", () => {
    const withZero = indexActivityByDate([day("2026-08-24", 0, 0)]);
    expect(totalsFor(["2026-08-24"], withZero).activeDays).toBe(0);
  });

  it("ignora datas repetidas apenas somando o que recebe", () => {
    // Documenta o contrato: quem chama passa um conjunto de dias distintos.
    expect(totalsFor(["2026-08-24", "2026-08-24"], activity).minutes).toBe(180);
  });
});
