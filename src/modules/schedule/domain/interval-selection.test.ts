import {
  buildSelection,
  isSameSelection,
  MIN_SELECTION_MINUTES,
  minuteAtOffset,
  offsetOfMinute,
  SCHEDULE_SNAP_MINUTES,
  selectionDuration,
  snapMinute,
  type SelectionBounds,
} from "./interval-selection";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js. Nada aqui
 * pode depender do relógio nem do fuso: a geometria de um dia é aritmética de
 * minutos civis, e é justamente essa separação que o fuso exótico protege.
 */

/** Janela útil típica: 06:00 às 23:00. */
const WINDOW: SelectionBounds = { minMinute: 6 * 60, maxMinute: 23 * 60 };

const at = (hour: number, minute = 0) => hour * 60 + minute;

describe("snapMinute", () => {
  it("mantém um horário já alinhado", () => {
    expect(snapMinute(at(14))).toBe(at(14));
    expect(snapMinute(at(14, 15))).toBe(at(14, 15));
  });

  it("arredonda para o passo mais próximo", () => {
    expect(snapMinute(at(14, 2))).toBe(at(14, 0));
    expect(snapMinute(at(14, 8))).toBe(at(14, 15));
    expect(snapMinute(at(14, 22))).toBe(at(14, 15));
    expect(snapMinute(at(14, 24))).toBe(at(14, 30));
  });

  it("resolve o meio do passo para cima, de forma estável", () => {
    // 7,5 min é o empate exato; o importante é não oscilar entre execuções.
    expect(snapMinute(at(14, 7) + 0.5)).toBe(at(14, 15));
    expect(snapMinute(at(14, 7) + 0.5)).toBe(snapMinute(at(14, 7) + 0.5));
  });

  it("lida com posições fracionárias vindas de pixels", () => {
    expect(snapMinute(840.4)).toBe(840);
    expect(snapMinute(847.9)).toBe(855);
  });

  it("aceita outro passo sem que nada mais mude", () => {
    expect(snapMinute(at(14, 20), 30)).toBe(at(14, 30));
    expect(snapMinute(at(14, 10), 30)).toBe(at(14, 0));
  });

  it("o passo padrão é de 15 minutos", () => {
    expect(SCHEDULE_SNAP_MINUTES).toBe(15);
    expect(MIN_SELECTION_MINUTES).toBe(15);
  });
});

describe("minuteAtOffset e offsetOfMinute", () => {
  it("convertem pixel em minuto na escala da tela Hoje", () => {
    // 1,5 px por minuto: 90 px abaixo do topo da janela = 1 h.
    expect(minuteAtOffset(90, WINDOW.minMinute, 1.5)).toBe(at(7));
  });

  it("convertem pixel em minuto na escala da semana", () => {
    expect(minuteAtOffset(90, WINDOW.minMinute, 1)).toBe(at(7, 30));
  });

  it("são inversas uma da outra", () => {
    for (const minute of [at(6), at(9, 45), at(14), at(22, 30)]) {
      for (const scale of [1, 1.5]) {
        const y = offsetOfMinute(minute, WINDOW.minMinute, scale);
        expect(minuteAtOffset(y, WINDOW.minMinute, scale)).toBeCloseTo(minute, 10);
      }
    }
  });

  it("o topo da janela é o offset zero", () => {
    expect(offsetOfMinute(WINDOW.minMinute, WINDOW.minMinute, 1.5)).toBe(0);
  });
});

describe("buildSelection — o caso do enunciado", () => {
  it("14:00 arrastando até 15:30 seleciona 14:00 → 15:30", () => {
    const selection = buildSelection(at(14), at(15, 30), WINDOW);

    expect(selection).toEqual({ startMinute: at(14), endMinute: at(15, 30) });
    expect(selectionDuration(selection)).toBe(90);
  });

  it("aplica o snap nas duas pontas", () => {
    expect(buildSelection(at(14, 2), at(15, 24), WINDOW)).toEqual({
      startMinute: at(14),
      endMinute: at(15, 30),
    });
  });
});

describe("buildSelection — direção do gesto", () => {
  it("arrastar para cima produz o mesmo intervalo que para baixo", () => {
    const descendo = buildSelection(at(14), at(15, 30), WINDOW);
    const subindo = buildSelection(at(15, 30), at(14), WINDOW);

    expect(subindo).toEqual(descendo);
  });

  it("a âncora não se move quando o gesto desce", () => {
    expect(buildSelection(at(14), at(20), WINDOW).startMinute).toBe(at(14));
  });

  it("a âncora não se move quando o gesto sobe", () => {
    expect(buildSelection(at(20), at(14), WINDOW).endMinute).toBe(at(20));
  });
});

describe("buildSelection — duração mínima", () => {
  it("um gesto sem movimento vira o intervalo mínimo, para baixo", () => {
    expect(buildSelection(at(14), at(14), WINDOW)).toEqual({
      startMinute: at(14),
      endMinute: at(14, 15),
    });
  });

  it("um micro-arrasto para baixo não cria bloco de poucos minutos", () => {
    expect(buildSelection(at(14), at(14, 3), WINDOW)).toEqual({
      startMinute: at(14),
      endMinute: at(14, 15),
    });
  });

  /**
   * A direção é decidida DEPOIS do snap, e é isso que evita o gesto trêmulo.
   * Enquanto o dedo não sai do passo em que ancorou, não existe intenção de
   * subir: um deslize de dois minutos não pode inverter o intervalo.
   */
  it("mover dentro do mesmo passo não inverte a direção", () => {
    expect(buildSelection(at(14), at(13, 58), WINDOW)).toEqual({
      startMinute: at(14),
      endMinute: at(14, 15),
    });
  });

  it("cruzar para o passo anterior inverte, preservando a âncora", () => {
    expect(buildSelection(at(14), at(13, 50), WINDOW)).toEqual({
      startMinute: at(13, 45),
      endMinute: at(14),
    });
  });

  it("nenhuma seleção jamais dura menos que o mínimo", () => {
    for (let delta = -40; delta <= 40; delta += 1) {
      const selection = buildSelection(at(14), at(14) + delta, WINDOW);
      expect(selectionDuration(selection)).toBeGreaterThanOrEqual(MIN_SELECTION_MINUTES);
    }
  });
});

describe("buildSelection — limites da janela", () => {
  it("não começa antes do início da janela", () => {
    const selection = buildSelection(at(8), at(2), WINDOW);

    expect(selection.startMinute).toBe(WINDOW.minMinute);
    expect(selection.endMinute).toBe(at(8));
  });

  it("não termina depois do fim da janela", () => {
    const selection = buildSelection(at(21), at(25), WINDOW);

    expect(selection.endMinute).toBe(WINDOW.maxMinute);
    expect(selection.startMinute).toBe(at(21));
  });

  it("encostando no fim da janela, a âncora cede para preservar o mínimo", () => {
    // Ancorar exatamente no fim não pode devolver um intervalo de zero minuto.
    expect(buildSelection(WINDOW.maxMinute, WINDOW.maxMinute, WINDOW)).toEqual({
      startMinute: WINDOW.maxMinute - MIN_SELECTION_MINUTES,
      endMinute: WINDOW.maxMinute,
    });
  });

  it("encostando no início da janela, a âncora cede para preservar o mínimo", () => {
    expect(buildSelection(WINDOW.minMinute, WINDOW.minMinute - 60, WINDOW)).toEqual({
      startMinute: WINDOW.minMinute,
      endMinute: WINDOW.minMinute + MIN_SELECTION_MINUTES,
    });
  });

  it("qualquer par de entradas produz uma seleção dentro da janela", () => {
    for (const anchor of [-100, at(6), at(12), at(23), at(30)]) {
      for (const current of [-100, at(6), at(12), at(23), at(30)]) {
        const selection = buildSelection(anchor, current, WINDOW);

        expect(selection.startMinute).toBeGreaterThanOrEqual(WINDOW.minMinute);
        expect(selection.endMinute).toBeLessThanOrEqual(WINDOW.maxMinute);
        expect(selection.startMinute).toBeLessThan(selection.endMinute);
      }
    }
  });

  it("uma janela degenerada devolve ela mesma em vez de um intervalo inválido", () => {
    const tiny: SelectionBounds = { minMinute: at(10), maxMinute: at(10, 10) };
    expect(buildSelection(at(10), at(10), tiny)).toEqual({
      startMinute: at(10),
      endMinute: at(10, 10),
    });
  });
});

describe("buildSelection — a seleção cai sempre na grade", () => {
  it("as duas pontas são múltiplas do passo", () => {
    for (let anchor = at(7); anchor < at(22); anchor += 7) {
      for (let current = at(7); current < at(22); current += 11) {
        const { startMinute, endMinute } = buildSelection(anchor, current, WINDOW);

        expect(startMinute % SCHEDULE_SNAP_MINUTES).toBe(0);
        expect(endMinute % SCHEDULE_SNAP_MINUTES).toBe(0);
      }
    }
  });
});

describe("isSameSelection", () => {
  it("compara por valor", () => {
    expect(
      isSameSelection({ startMinute: 60, endMinute: 90 }, { startMinute: 60, endMinute: 90 }),
    ).toBe(true);
    expect(
      isSameSelection({ startMinute: 60, endMinute: 90 }, { startMinute: 60, endMinute: 105 }),
    ).toBe(false);
  });

  it("trata a ausência de seleção", () => {
    expect(isSameSelection(null, null)).toBe(true);
    expect(isSameSelection(null, { startMinute: 60, endMinute: 90 })).toBe(false);
    expect(isSameSelection({ startMinute: 60, endMinute: 90 }, null)).toBe(false);
  });
});
