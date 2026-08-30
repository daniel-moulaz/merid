import { indexActivityByDate, type DayActivity } from "./activity";
import { bestStreak, currentStreak } from "./streak";

const days = (...dates: readonly string[]): DayActivity[] =>
  dates.map((date) => ({ date, minutes: 30, tasks: 1 }));

const activityOf = (...dates: readonly string[]) => indexActivityByDate(days(...dates));

/** 2026-08-29 é um sábado; 2026-08-24, a segunda que abre aquela semana. */
const TODAY = "2026-08-29";

describe("currentStreak", () => {
  it("é zero sem nenhuma atividade", () => {
    expect(currentStreak(activityOf(), TODAY)).toBe(0);
  });

  it("conta um dia quando só hoje tem atividade", () => {
    expect(currentStreak(activityOf(TODAY), TODAY)).toBe(1);
  });

  it("conta dias consecutivos terminando hoje", () => {
    expect(currentStreak(activityOf("2026-08-27", "2026-08-28", "2026-08-29"), TODAY)).toBe(3);
  });

  /**
   * O caso central: são 9 da manhã e hoje ainda não teve conclusão. A sequência
   * de ontem continua valendo — o dia ainda não terminou.
   */
  it("mantém a sequência de ontem quando hoje ainda não teve conclusão", () => {
    expect(currentStreak(activityOf("2026-08-26", "2026-08-27", "2026-08-28"), TODAY)).toBe(3);
  });

  it("quebra somente quando um dia civil inteiro passou sem atividade", () => {
    // Última atividade anteontem: ontem fechou vazio, então a sequência caiu.
    expect(currentStreak(activityOf("2026-08-26", "2026-08-27"), TODAY)).toBe(0);
  });

  it("ignora atividade anterior a um buraco", () => {
    const activity = activityOf("2026-08-20", "2026-08-21", "2026-08-28", "2026-08-29");
    expect(currentStreak(activity, TODAY)).toBe(2);
  });

  it("não conta dias futuros", () => {
    // Uma conclusão registrada amanhã não pode inflar a sequência de hoje.
    expect(currentStreak(activityOf("2026-08-30", "2026-08-31"), TODAY)).toBe(0);
  });

  it("atravessa a virada de mês", () => {
    const activity = activityOf("2026-07-30", "2026-07-31", "2026-08-01");
    expect(currentStreak(activity, "2026-08-01")).toBe(3);
  });

  it("atravessa a virada de ano", () => {
    const activity = activityOf("2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02");
    expect(currentStreak(activity, "2027-01-02")).toBe(4);
  });

  it("conta 29 de fevereiro em ano bissexto", () => {
    const activity = activityOf("2028-02-28", "2028-02-29", "2028-03-01");
    expect(currentStreak(activity, "2028-03-01")).toBe(3);
  });

  it("um dia registrado com zero minutos não sustenta a sequência", () => {
    const activity = indexActivityByDate([
      { date: "2026-08-27", minutes: 30, tasks: 1 },
      { date: "2026-08-28", minutes: 0, tasks: 0 },
      { date: "2026-08-29", minutes: 30, tasks: 1 },
    ]);
    expect(currentStreak(activity, TODAY)).toBe(1);
  });
});

describe("bestStreak", () => {
  it("é zero sem atividade", () => {
    expect(bestStreak(activityOf())).toBe(0);
  });

  it("é um para um único dia", () => {
    expect(bestStreak(activityOf("2026-08-10"))).toBe(1);
  });

  it("encontra a maior corrida entre várias", () => {
    const activity = activityOf(
      "2026-08-01",
      "2026-08-02",
      // buraco
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      // buraco
      "2026-08-20",
    );
    expect(bestStreak(activity)).toBe(4);
  });

  it("não depende da ordem de entrada", () => {
    const activity = activityOf("2026-08-13", "2026-08-11", "2026-08-12", "2026-08-10");
    expect(bestStreak(activity)).toBe(4);
  });

  it("atravessa mês e ano", () => {
    const activity = activityOf(
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    );
    expect(bestStreak(activity)).toBe(5);
  });

  it("nunca é menor que a sequência atual", () => {
    const activity = activityOf("2026-08-27", "2026-08-28", "2026-08-29");
    expect(bestStreak(activity)).toBeGreaterThanOrEqual(currentStreak(activity, TODAY));
  });

  it("dias com zero minutos partem a corrida", () => {
    const activity = indexActivityByDate([
      { date: "2026-08-10", minutes: 30, tasks: 1 },
      { date: "2026-08-11", minutes: 0, tasks: 0 },
      { date: "2026-08-12", minutes: 30, tasks: 1 },
    ]);
    expect(bestStreak(activity)).toBe(1);
  });
});
