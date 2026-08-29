import { instantFrom, timeOfDayInTimeZone, toCalendarDateInTimeZone } from "@/lib/time";
import type { Task } from "@/modules/tasks/domain/task";

import {
  blockDurationMinutes,
  resolveBlockInstants,
  selectUnscheduledTasks,
  suggestEndTime,
  unscheduledBoundary,
} from "./schedule-block";

const TZ = "America/Sao_Paulo";
const DATE = "2026-08-29";

function makeTask(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    title: "Tarefa",
    description: null,
    estimatedMinutes: 30,
    priority: "MEDIUM",
    dueDate: null,
    status: "TODO",
    completedAt: null,
    createdAt: new Date("2026-08-29T12:00:00.000Z"),
    updatedAt: new Date("2026-08-29T12:00:00.000Z"),
    ...overrides,
  };
}

describe("blockDurationMinutes", () => {
  it("mede a duração RESERVADA, que é independente da estimativa da tarefa", () => {
    const block = {
      startsAt: instantFrom(DATE, "14:00", TZ),
      endsAt: instantFrom(DATE, "15:00", TZ),
    };

    // A tarefa pode estar estimada em 90 minutos: o bloco continua sendo 60.
    expect(blockDurationMinutes(block)).toBe(60);
  });

  it("mede blocos curtos", () => {
    expect(
      blockDurationMinutes({
        startsAt: instantFrom(DATE, "14:00", TZ),
        endsAt: instantFrom(DATE, "14:15", TZ),
      }),
    ).toBe(15);
  });

  it("mede bloco que atravessa a meia-noite", () => {
    expect(
      blockDurationMinutes({
        startsAt: instantFrom(DATE, "23:00", TZ),
        endsAt: instantFrom("2026-08-30", "01:00", TZ),
      }),
    ).toBe(120);
  });
});

describe("suggestEndTime — o fim sugerido vem da estimativa da tarefa", () => {
  it("soma a estimativa ao início", () => {
    expect(suggestEndTime("14:00", 90)).toBe("15:30");
    expect(suggestEndTime("09:00", 30)).toBe("09:30");
    expect(suggestEndTime("10:15", 45)).toBe("11:00");
  });

  it("aceita estimativas longas", () => {
    expect(suggestEndTime("08:00", 480)).toBe("16:00");
  });

  it("dá a volta na meia-noite", () => {
    expect(suggestEndTime("23:00", 90)).toBe("00:30");
  });

  it("recusa estimativa inválida", () => {
    expect(() => suggestEndTime("14:00", 0)).toThrow(TypeError);
    expect(() => suggestEndTime("14:00", -30)).toThrow(TypeError);
    expect(() => suggestEndTime("14:00", 30.5)).toThrow(TypeError);
  });
});

describe("resolveBlockInstants — formulário civil vira instantes", () => {
  it("converte dia + horários no fuso do usuário", () => {
    const { startsAt, endsAt } = resolveBlockInstants(
      { date: DATE, startTime: "14:00", endTime: "15:30" },
      TZ,
    );

    expect(startsAt.toISOString()).toBe("2026-08-29T17:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-08-29T18:30:00.000Z");
  });

  it("o mesmo formulário em outro fuso produz outros instantes", () => {
    const values = { date: DATE, startTime: "14:00", endTime: "15:30" };
    const saoPaulo = resolveBlockInstants(values, TZ);
    const tokyo = resolveBlockInstants(values, "Asia/Tokyo");

    expect(saoPaulo.startsAt.getTime()).not.toBe(tokyo.startsAt.getTime());
  });

  it("o instante volta a ser o horário digitado quando exibido no fuso do usuário", () => {
    const { startsAt, endsAt } = resolveBlockInstants(
      { date: DATE, startTime: "08:45", endTime: "09:15" },
      TZ,
    );

    expect(timeOfDayInTimeZone(startsAt, TZ)).toBe("08:45");
    expect(timeOfDayInTimeZone(endsAt, TZ)).toBe("09:15");
    expect(toCalendarDateInTimeZone(startsAt, TZ)).toBe(DATE);
  });

  it("fim MENOR que o início atravessa a meia-noite (dia seguinte)", () => {
    const { startsAt, endsAt } = resolveBlockInstants(
      { date: DATE, startTime: "23:00", endTime: "01:00" },
      TZ,
    );

    expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime());
    expect(toCalendarDateInTimeZone(endsAt, TZ)).toBe("2026-08-30");
    expect(timeOfDayInTimeZone(endsAt, TZ)).toBe("01:00");
  });

  it("fim IGUAL ao início vira um bloco de 24 horas, nunca um bloco vazio", () => {
    const { startsAt, endsAt } = resolveBlockInstants(
      { date: DATE, startTime: "14:00", endTime: "14:00" },
      TZ,
    );

    expect(endsAt.getTime() - startsAt.getTime()).toBe(24 * 60 * 60_000);
  });

  it("um fuso adiantado muda o DIA em UTC sem mudar o dia civil do usuário", () => {
    // Kiritimati é UTC+14: 08:00 local de 29/08 é 18:00Z de 28/08.
    const { startsAt } = resolveBlockInstants(
      { date: DATE, startTime: "08:00", endTime: "09:00" },
      "Pacific/Kiritimati",
    );

    expect(startsAt.toISOString()).toBe("2026-08-28T18:00:00.000Z");
    expect(toCalendarDateInTimeZone(startsAt, "Pacific/Kiritimati")).toBe(DATE);
  });
});

describe("tarefas não agendadas", () => {
  it("a fronteira é o início do dia NO FUSO DO USUÁRIO", () => {
    expect(unscheduledBoundary(DATE, TZ).toISOString()).toBe("2026-08-29T03:00:00.000Z");
    expect(unscheduledBoundary(DATE, "UTC").toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });

  it("tarefa aberta sem nenhum bloco é não agendada", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];

    expect(selectUnscheduledTasks(tasks, new Set()).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("tarefa com bloco relevante sai da lista", () => {
    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b" })];

    expect(selectUnscheduledTasks(tasks, new Set(["a"])).map((t) => t.id)).toEqual(["b"]);
  });

  it("tarefa cujo ÚNICO bloco ficou no passado volta a ser não agendada", () => {
    // O conjunto de ids agendados só contém tarefas com bloco terminando de
    // hoje em diante — uma tarefa com bloco só de ontem não está nele.
    const tasks = [makeTask({ id: "ontem" })];
    const scheduledFromTodayOn = new Set<string>();

    expect(selectUnscheduledTasks(tasks, scheduledFromTodayOn).map((t) => t.id)).toEqual([
      "ontem",
    ]);
  });

  it("tarefa concluída nunca aparece como não agendada", () => {
    const tasks = [
      makeTask({ id: "feita", status: "DONE", completedAt: new Date() }),
      makeTask({ id: "aberta" }),
    ];

    expect(selectUnscheduledTasks(tasks, new Set()).map((t) => t.id)).toEqual(["aberta"]);
  });

  it("preserva a ordem recebida do repositório", () => {
    const tasks = [makeTask({ id: "1" }), makeTask({ id: "2" }), makeTask({ id: "3" })];

    expect(selectUnscheduledTasks(tasks, new Set(["2"])).map((t) => t.id)).toEqual(["1", "3"]);
  });
});
