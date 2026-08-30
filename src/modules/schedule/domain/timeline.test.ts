import { instantFrom } from "@/lib/time";

import {
  buildTimelineWindow,
  dayBlockContinuity,
  hourMarks,
  layoutBlocks,
  minuteOffsetInWindow,
} from "./timeline";

/**
 * A timeline é medida em minutos desde o início do dia DO USUÁRIO. A suíte roda
 * em UTC+14 (jest.config.js): qualquer cálculo que escorregue para o relógio da
 * máquina falha aqui.
 */

const TZ = "America/Sao_Paulo";
const DATE = "2026-08-29";

const block = (id: string, start: string, end: string) => ({
  id,
  startsAt: instantFrom(DATE, start, TZ),
  endsAt: instantFrom(DATE, end, TZ),
});

describe("buildTimelineWindow", () => {
  it("abre na janela útil padrão de 06:00 a 23:00", () => {
    const window = buildTimelineWindow(DATE, TZ);

    expect(window.startMinute).toBe(6 * 60);
    expect(window.endMinute).toBe(23 * 60);
    expect(window.totalMinutes).toBe(17 * 60);
    expect(window.dayMinutes).toBe(1440);
  });

  it("o início do dia é meia-noite NO FUSO DO USUÁRIO, não em UTC", () => {
    const window = buildTimelineWindow(DATE, TZ);

    // São Paulo é UTC-3: 00:00 local = 03:00Z.
    expect(window.dayStartsAt.toISOString()).toBe("2026-08-29T03:00:00.000Z");
  });

  it("blocos dentro da janela não a alteram", () => {
    const window = buildTimelineWindow(DATE, TZ, [block("a", "09:00", "10:30")]);

    expect(window.startMinute).toBe(6 * 60);
    expect(window.endMinute).toBe(23 * 60);
  });

  it("expande para CIMA quando há bloco de madrugada", () => {
    const window = buildTimelineWindow(DATE, TZ, [block("a", "04:20", "05:00")]);

    // Arredonda para a hora cheia anterior.
    expect(window.startMinute).toBe(4 * 60);
    expect(window.endMinute).toBe(23 * 60);
  });

  it("expande para BAIXO quando há bloco tarde da noite", () => {
    const window = buildTimelineWindow(DATE, TZ, [block("a", "23:10", "23:40")]);

    expect(window.startMinute).toBe(6 * 60);
    // Arredonda para a hora cheia seguinte.
    expect(window.endMinute).toBe(24 * 60);
  });

  it("nunca ultrapassa o próprio dia", () => {
    const crossesMidnight = {
      id: "a",
      startsAt: instantFrom(DATE, "23:00", TZ),
      endsAt: instantFrom("2026-08-30", "01:00", TZ),
    };
    const window = buildTimelineWindow(DATE, TZ, [crossesMidnight]);

    expect(window.endMinute).toBe(1440);
    expect(window.startMinute).toBeGreaterThanOrEqual(0);
  });

  it("aceita janela customizada", () => {
    const window = buildTimelineWindow(DATE, TZ, [], {
      startTime: "08:00",
      endTime: "18:00",
    });

    expect(window.startMinute).toBe(8 * 60);
    expect(window.endMinute).toBe(18 * 60);
  });

  it("ignora blocos com duração não positiva", () => {
    const window = buildTimelineWindow(DATE, TZ, [block("a", "03:00", "03:00")]);

    expect(window.startMinute).toBe(6 * 60);
  });

  it("garante ao menos uma hora de janela", () => {
    const window = buildTimelineWindow(DATE, TZ, [], {
      startTime: "10:00",
      endTime: "10:00",
    });

    expect(window.totalMinutes).toBeGreaterThanOrEqual(60);
  });
});

describe("minuteOffsetInWindow", () => {
  it("converte instante em offset do dia", () => {
    const window = buildTimelineWindow(DATE, TZ);

    expect(minuteOffsetInWindow(instantFrom(DATE, "00:00", TZ), window)).toBe(0);
    expect(minuteOffsetInWindow(instantFrom(DATE, "09:00", TZ), window)).toBe(540);
    expect(minuteOffsetInWindow(instantFrom(DATE, "14:30", TZ), window)).toBe(870);
  });
});

describe("hourMarks", () => {
  it("gera uma marca por hora cheia dentro da janela", () => {
    const window = buildTimelineWindow(DATE, TZ);
    const marks = hourMarks(window, TZ);

    expect(marks[0]?.label).toBe("06:00");
    expect(marks.at(-1)?.label).toBe("23:00");
    expect(marks).toHaveLength(18);
  });

  it("os rótulos são a hora do relógio DO USUÁRIO", () => {
    const window = buildTimelineWindow(DATE, TZ, [], {
      startTime: "08:00",
      endTime: "11:00",
    });

    expect(hourMarks(window, TZ).map((mark) => mark.label)).toEqual([
      "08:00",
      "09:00",
      "10:00",
      "11:00",
    ]);
  });

  it("o MESMO dia lido de outro fuso mostra outras horas", () => {
    const window = buildTimelineWindow(DATE, TZ, [], {
      startTime: "08:00",
      endTime: "10:00",
    });

    // A janela é a mesma faixa de instantes; só a apresentação muda.
    expect(hourMarks(window, "UTC").map((mark) => mark.label)).toEqual([
      "11:00",
      "12:00",
      "13:00",
    ]);
  });
});

describe("layoutBlocks — posicionamento", () => {
  const window = buildTimelineWindow(DATE, TZ);

  it("posiciona pelo offset real e mede a duração", () => {
    const [positioned] = layoutBlocks([block("a", "09:00", "10:30")], window);

    expect(positioned?.startMinute).toBe(540);
    expect(positioned?.endMinute).toBe(630);
  });

  it("um bloco sozinho ocupa a largura inteira", () => {
    const [positioned] = layoutBlocks([block("a", "09:00", "10:30")], window);

    expect(positioned?.lane).toBe(0);
    expect(positioned?.laneCount).toBe(1);
    expect(positioned?.hasConflict).toBe(false);
  });

  it("blocos disjuntos ocupam cada um a largura inteira", () => {
    const positioned = layoutBlocks(
      [block("a", "09:00", "10:30"), block("b", "14:00", "15:30")],
      window,
    );

    expect(positioned.map((p) => p.laneCount)).toEqual([1, 1]);
    expect(positioned.map((p) => p.hasConflict)).toEqual([false, false]);
  });

  it("blocos que apenas se tocam NÃO dividem largura", () => {
    const positioned = layoutBlocks(
      [block("a", "14:00", "15:00"), block("b", "15:00", "16:00")],
      window,
    );

    expect(positioned.map((p) => p.laneCount)).toEqual([1, 1]);
    expect(positioned.every((p) => !p.hasConflict)).toBe(true);
  });

  it("ordena cronologicamente mesmo recebendo fora de ordem", () => {
    const positioned = layoutBlocks(
      [block("tarde", "14:00", "15:00"), block("manha", "09:00", "10:00")],
      window,
    );

    expect(positioned.map((p) => p.item.id)).toEqual(["manha", "tarde"]);
  });

  it("recorta à janela um bloco que atravessa a meia-noite", () => {
    const crossing = {
      id: "vira",
      startsAt: instantFrom(DATE, "23:00", TZ),
      endsAt: instantFrom("2026-08-30", "01:00", TZ),
    };
    const expanded = buildTimelineWindow(DATE, TZ, [crossing]);
    const [positioned] = layoutBlocks([crossing], expanded);

    expect(positioned?.startMinute).toBe(23 * 60);
    // Recortado na meia-noite: o resto pertence ao dia seguinte.
    expect(positioned?.endMinute).toBe(24 * 60);
  });

  it("descarta bloco sem interseção visível com a janela", () => {
    // Bloco às 03:00 com janela forçada em 06:00-23:00.
    const fixed = buildTimelineWindow(DATE, TZ, [], {
      startTime: "06:00",
      endTime: "23:00",
    });

    expect(layoutBlocks([block("a", "03:00", "04:00")], fixed)).toEqual([]);
  });

  it("preserva blocos curtos com duração proporcional real", () => {
    const positioned = layoutBlocks([block("curto", "14:00", "14:15")], window);

    expect(positioned[0]?.endMinute! - positioned[0]?.startMinute!).toBe(15);
  });
});

describe("layoutBlocks — blocos sobrepostos ganham colunas", () => {
  const window = buildTimelineWindow(DATE, TZ);

  it("dois blocos sobrepostos dividem a largura ao meio", () => {
    const positioned = layoutBlocks(
      [block("a", "14:00", "15:30"), block("b", "15:00", "16:00")],
      window,
    );

    expect(positioned.map((p) => p.laneCount)).toEqual([2, 2]);
    expect(positioned.map((p) => p.lane)).toEqual([0, 1]);
    expect(positioned.every((p) => p.hasConflict)).toBe(true);
  });

  it("nenhum bloco fica escondido: todos aparecem no resultado", () => {
    const blocks = [
      block("a", "14:00", "16:00"),
      block("b", "14:00", "16:00"),
      block("c", "14:00", "16:00"),
    ];
    const positioned = layoutBlocks(blocks, window);

    expect(positioned).toHaveLength(3);
    expect(positioned.map((p) => p.lane).sort()).toEqual([0, 1, 2]);
    expect(positioned.every((p) => p.laneCount === 3)).toBe(true);
  });

  it("contenção completa também divide largura", () => {
    const positioned = layoutBlocks(
      [block("fora", "09:00", "12:00"), block("dentro", "10:00", "11:00")],
      window,
    );

    expect(positioned.every((p) => p.laneCount === 2)).toBe(true);
    expect(positioned.every((p) => p.hasConflict)).toBe(true);
  });

  it("reaproveita a coluna quando o bloco anterior já terminou", () => {
    // a e b se sobrepõem; c começa depois de a terminar e pode voltar à coluna 0.
    const positioned = layoutBlocks(
      [
        block("a", "09:00", "10:00"),
        block("b", "09:30", "11:00"),
        block("c", "10:00", "10:30"),
      ],
      window,
    );

    const byId = new Map(positioned.map((p) => [p.item.id, p]));
    expect(byId.get("a")?.lane).toBe(0);
    expect(byId.get("b")?.lane).toBe(1);
    expect(byId.get("c")?.lane).toBe(0);
    expect(positioned.every((p) => p.laneCount === 2)).toBe(true);
  });

  it("blocos ligados TRANSITIVAMENTE formam um grupo só", () => {
    // a e c não se sobrepõem, mas b liga os dois: os três dividem a largura.
    const positioned = layoutBlocks(
      [
        block("a", "09:00", "10:00"),
        block("b", "09:30", "11:00"),
        block("c", "10:30", "12:00"),
      ],
      window,
    );

    expect(positioned.every((p) => p.laneCount === 2)).toBe(true);

    const byId = new Map(positioned.map((p) => [p.item.id, p]));
    // a e c não conflitam entre si, mas ambos conflitam com b.
    expect(byId.get("a")?.hasConflict).toBe(true);
    expect(byId.get("c")?.hasConflict).toBe(true);
  });

  it("hasConflict é falso para quem só divide grupo sem sobrepor ninguém", () => {
    // a(09-10) e c(10-11) encostam; b(09:30-09:45) conflita só com a.
    const positioned = layoutBlocks(
      [
        block("a", "09:00", "10:00"),
        block("b", "09:30", "09:45"),
        block("c", "10:00", "11:00"),
      ],
      window,
    );

    const byId = new Map(positioned.map((p) => [p.item.id, p]));
    expect(byId.get("a")?.hasConflict).toBe(true);
    expect(byId.get("b")?.hasConflict).toBe(true);
    expect(byId.get("c")?.hasConflict).toBe(false);
  });

  it("grupos independentes não influenciam a largura um do outro", () => {
    const positioned = layoutBlocks(
      [
        block("manha1", "09:00", "10:00"),
        block("manha2", "09:30", "10:30"),
        block("tarde", "14:00", "15:00"),
      ],
      window,
    );

    const byId = new Map(positioned.map((p) => [p.item.id, p]));
    expect(byId.get("manha1")?.laneCount).toBe(2);
    expect(byId.get("manha2")?.laneCount).toBe(2);
    expect(byId.get("tarde")?.laneCount).toBe(1);
  });

  it("lista vazia produz layout vazio", () => {
    expect(layoutBlocks([], window)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe("dayBlockContinuity", () => {

  /**
   * A regressão que este bloco fixa: a timeline do dia oferecia o gesto de
   * arrastar para QUALQUER cartão, inclusive o pedaço de um bloco que atravessa
   * a meia-noite. Como `layoutBlocks` recorta ao dia visível, arrastar esse
   * pedaço gravava o pedaço no lugar do bloco inteiro — a parte do dia anterior
   * desaparecia e a duração encolhia, em silêncio.
   */
  it("um bloco inteiro dentro do dia não continua para lado nenhum", () => {
    const window = buildTimelineWindow("2026-03-10", TZ);
    const block = {
      id: "a",
      startsAt: instantFrom("2026-03-10", "14:00", TZ),
      endsAt: instantFrom("2026-03-10", "15:30", TZ),
    };

    expect(dayBlockContinuity(block, window)).toEqual({
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it("detecta o pedaço que começou no dia anterior", () => {
    const block = {
      id: "a",
      startsAt: instantFrom("2026-03-09", "23:00", TZ),
      endsAt: instantFrom("2026-03-10", "01:00", TZ),
    };
    const window = buildTimelineWindow("2026-03-10", TZ, [block]);

    expect(dayBlockContinuity(block, window)).toEqual({
      continuesBefore: true,
      continuesAfter: false,
    });
  });

  it("detecta o pedaço que continua no dia seguinte", () => {
    const block = {
      id: "a",
      startsAt: instantFrom("2026-03-09", "23:00", TZ),
      endsAt: instantFrom("2026-03-10", "01:00", TZ),
    };
    const window = buildTimelineWindow("2026-03-09", TZ, [block]);

    expect(dayBlockContinuity(block, window)).toEqual({
      continuesBefore: false,
      continuesAfter: true,
    });
  });

  it("um bloco que termina exatamente à meia-noite NÃO continua depois", () => {
    // 24:00 é o fim do dia, não o começo do próximo: recortar aqui não perde
    // nada, então o gesto continua legítimo.
    const block = {
      id: "a",
      startsAt: instantFrom("2026-03-10", "22:00", TZ),
      endsAt: instantFrom("2026-03-11", "00:00", TZ),
    };
    const window = buildTimelineWindow("2026-03-10", TZ, [block]);

    expect(dayBlockContinuity(block, window)).toEqual({
      continuesBefore: false,
      continuesAfter: false,
    });
  });

  it("um bloco fora da janela visível, mas dentro do dia, continua arrastável", () => {
    // A janela padrão começa às 06:00. Um bloco às 03:00 expande a janela; o
    // que não pode acontecer é ele ser confundido com um segmento partido.
    const block = {
      id: "a",
      startsAt: instantFrom("2026-03-10", "03:00", TZ),
      endsAt: instantFrom("2026-03-10", "04:00", TZ),
    };
    const window = buildTimelineWindow("2026-03-10", TZ, [block]);

    expect(dayBlockContinuity(block, window)).toEqual({
      continuesBefore: false,
      continuesAfter: false,
    });
  });
});
