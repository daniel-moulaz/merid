import {
  compareIntervals,
  findOverlapping,
  isValidInterval,
  overlapMinutes,
  overlaps,
  type Interval,
} from "./overlap";

/**
 * A regra R5 do produto: intervalo SEMIABERTO [startsAt, endsAt).
 *
 * Os horários dos casos usam UTC de propósito — sobreposição é uma propriedade
 * de INSTANTES, não do fuso em que eles são exibidos. A suíte roda em UTC+14
 * (ver jest.config.js): se algum cálculo escorregasse para o relógio local,
 * quebraria aqui.
 */

const at = (iso: string): Date => new Date(`2026-08-29T${iso}:00.000Z`);

const interval = (start: string, end: string): Interval => ({
  startsAt: at(start),
  endsAt: at(end),
});

const withId = (id: string, start: string, end: string) => ({
  id,
  ...interval(start, end),
});

describe("isValidInterval", () => {
  it("aceita duração positiva", () => {
    expect(isValidInterval(interval("14:00", "15:00"))).toBe(true);
  });

  it("recusa duração zero", () => {
    expect(isValidInterval(interval("14:00", "14:00"))).toBe(false);
  });

  it("recusa duração negativa", () => {
    expect(isValidInterval(interval("15:00", "14:00"))).toBe(false);
  });

  it("recusa data inválida", () => {
    expect(
      isValidInterval({ startsAt: new Date("nada"), endsAt: at("15:00") }),
    ).toBe(false);
    expect(
      isValidInterval({ startsAt: at("14:00"), endsAt: new Date("nada") }),
    ).toBe(false);
  });
});

describe("overlaps", () => {
  it("detecta sobreposição PARCIAL (o fim de um invade o início do outro)", () => {
    const a = interval("14:00", "15:00");
    const b = interval("14:30", "15:30");

    expect(overlaps(a, b)).toBe(true);
    expect(overlaps(b, a)).toBe(true);
  });

  it("detecta CONTENÇÃO completa", () => {
    const outer = interval("09:00", "12:00");
    const inner = interval("10:00", "11:00");

    expect(overlaps(outer, inner)).toBe(true);
    expect(overlaps(inner, outer)).toBe(true);
  });

  it("detecta intervalos IDÊNTICOS", () => {
    const a = interval("14:00", "15:00");
    const b = interval("14:00", "15:00");

    expect(overlaps(a, b)).toBe(true);
  });

  it("detecta início compartilhado com durações diferentes", () => {
    expect(overlaps(interval("14:00", "15:00"), interval("14:00", "14:15"))).toBe(true);
  });

  it("detecta fim compartilhado com durações diferentes", () => {
    expect(overlaps(interval("14:00", "15:00"), interval("14:45", "15:00"))).toBe(true);
  });

  it("NÃO considera conflito bordas que apenas se tocam (14:00-15:00 e 15:00-16:00)", () => {
    const a = interval("14:00", "15:00");
    const b = interval("15:00", "16:00");

    expect(overlaps(a, b)).toBe(false);
    expect(overlaps(b, a)).toBe(false);
  });

  it("NÃO considera conflito bloco totalmente ANTES", () => {
    expect(overlaps(interval("08:00", "09:00"), interval("14:00", "15:00"))).toBe(false);
  });

  it("NÃO considera conflito bloco totalmente DEPOIS", () => {
    expect(overlaps(interval("18:00", "19:00"), interval("14:00", "15:00"))).toBe(false);
  });

  it("um minuto de interseção já é conflito", () => {
    expect(overlaps(interval("14:00", "15:00"), interval("14:59", "16:00"))).toBe(true);
  });

  it("intervalo inválido nunca conflita", () => {
    const invalid = interval("15:00", "14:00");
    const valid = interval("14:00", "16:00");

    expect(overlaps(invalid, valid)).toBe(false);
    expect(overlaps(valid, invalid)).toBe(false);
  });

  it("é simétrico para qualquer par", () => {
    const pairs: [Interval, Interval][] = [
      [interval("14:00", "15:00"), interval("14:30", "15:30")],
      [interval("14:00", "15:00"), interval("15:00", "16:00")],
      [interval("09:00", "12:00"), interval("10:00", "11:00")],
      [interval("08:00", "09:00"), interval("20:00", "21:00")],
    ];

    for (const [a, b] of pairs) {
      expect(overlaps(a, b)).toBe(overlaps(b, a));
    }
  });

  it("funciona com blocos que atravessam a meia-noite", () => {
    const lateNight: Interval = {
      startsAt: new Date("2026-08-29T23:00:00.000Z"),
      endsAt: new Date("2026-08-30T01:00:00.000Z"),
    };
    const earlyMorning: Interval = {
      startsAt: new Date("2026-08-30T00:30:00.000Z"),
      endsAt: new Date("2026-08-30T02:00:00.000Z"),
    };

    expect(overlaps(lateNight, earlyMorning)).toBe(true);
  });
});

describe("overlapMinutes", () => {
  it("mede a interseção parcial", () => {
    expect(overlapMinutes(interval("14:00", "15:00"), interval("14:30", "15:30"))).toBe(30);
  });

  it("mede a contenção pelo intervalo interno", () => {
    expect(overlapMinutes(interval("09:00", "12:00"), interval("10:00", "11:00"))).toBe(60);
  });

  it("é zero para bordas que se tocam", () => {
    expect(overlapMinutes(interval("14:00", "15:00"), interval("15:00", "16:00"))).toBe(0);
  });

  it("é zero para intervalos disjuntos", () => {
    expect(overlapMinutes(interval("08:00", "09:00"), interval("14:00", "15:00"))).toBe(0);
  });
});

describe("findOverlapping", () => {
  const existing = [
    withId("manha", "09:00", "10:30"),
    withId("tarde", "14:00", "15:30"),
    withId("noite", "20:00", "21:00"),
  ];

  it("devolve apenas os blocos que conflitam", () => {
    const conflicts = findOverlapping(interval("15:00", "16:00"), existing);

    expect(conflicts.map((block) => block.id)).toEqual(["tarde"]);
  });

  it("devolve vazio quando o horário está livre", () => {
    expect(findOverlapping(interval("11:00", "12:00"), existing)).toEqual([]);
  });

  it("devolve vazio quando encosta sem sobrepor", () => {
    expect(findOverlapping(interval("15:30", "16:30"), existing)).toEqual([]);
    expect(findOverlapping(interval("13:00", "14:00"), existing)).toEqual([]);
  });

  it("devolve múltiplos conflitos", () => {
    const conflicts = findOverlapping(interval("09:00", "21:00"), existing);

    expect(conflicts.map((block) => block.id)).toEqual(["manha", "tarde", "noite"]);
  });

  it("ao EDITAR, o bloco não conflita consigo mesmo", () => {
    // Mesmo horário do bloco "tarde": sem `excludeId` acusaria falso conflito.
    const candidate = interval("14:00", "15:30");

    expect(findOverlapping(candidate, existing).map((b) => b.id)).toEqual(["tarde"]);
    expect(findOverlapping(candidate, existing, { excludeId: "tarde" })).toEqual([]);
  });

  it("excluir um id não esconde o conflito com OUTRO bloco", () => {
    const conflicts = findOverlapping(interval("10:00", "14:30"), existing, {
      excludeId: "manha",
    });

    expect(conflicts.map((block) => block.id)).toEqual(["tarde"]);
  });

  it("lista vazia nunca conflita", () => {
    expect(findOverlapping(interval("14:00", "15:00"), [])).toEqual([]);
  });
});

describe("compareIntervals", () => {
  it("ordena por início", () => {
    const sorted = [
      interval("14:00", "15:00"),
      interval("09:00", "10:00"),
      interval("20:00", "21:00"),
    ].sort(compareIntervals);

    expect(sorted.map((i) => i.startsAt.toISOString())).toEqual([
      at("09:00").toISOString(),
      at("14:00").toISOString(),
      at("20:00").toISOString(),
    ]);
  });

  it("com o mesmo início, o mais curto vem primeiro", () => {
    const sorted = [interval("14:00", "16:00"), interval("14:00", "15:00")].sort(
      compareIntervals,
    );

    expect(sorted[0]?.endsAt.toISOString()).toBe(at("15:00").toISOString());
  });
});
