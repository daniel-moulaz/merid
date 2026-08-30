import type { SelectionBounds } from "./interval-selection";
import {
  cancelSelection,
  finishSelection,
  IDLE_SELECTION,
  isSameSelectedInterval,
  moveSelection,
  startSelection,
  type SelectionGeometry,
} from "./selection-gesture";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js.
 *
 * Aqui se testa a SEQUÊNCIA do gesto, que é onde moram os defeitos difíceis:
 * eventos fora de ordem, gesto interrompido, evento que chega depois do fim.
 */

const BOUNDS: SelectionBounds = { minMinute: 6 * 60, maxMinute: 23 * 60 };

/** Escala da tela Hoje: 1,5 px por minuto, janela começando às 06:00. */
const GEOMETRY: SelectionGeometry = {
  windowStartMinute: BOUNDS.minMinute,
  pixelsPerMinute: 1.5,
  bounds: BOUNDS,
};

const DAY = "2026-08-30";
const OTHER_DAY = "2026-08-31";

const at = (hour: number, minute = 0) => hour * 60 + minute;
/** Posição vertical, em pixels, de um horário nesta geometria. */
const y = (hour: number, minute = 0) => (at(hour, minute) - BOUNDS.minMinute) * 1.5;

describe("começar", () => {
  it("ancora e já mostra o intervalo mínimo", () => {
    const state = startSelection(DAY, y(14), GEOMETRY);

    expect(state.anchor).toEqual({ date: DAY, minute: at(14) });
    expect(state.current).toEqual({
      date: DAY,
      selection: { startMinute: at(14), endMinute: at(14, 15) },
    });
  });

  it("aplica o snap já no toque inicial", () => {
    const state = startSelection(DAY, y(14, 8), GEOMETRY);
    expect(state.current?.selection.startMinute).toBe(at(14, 15));
  });
});

describe("mover", () => {
  it("estende até o horário sob o dedo", () => {
    const started = startSelection(DAY, y(14), GEOMETRY);
    const moved = moveSelection(started, y(15, 30), GEOMETRY);

    expect(moved.current?.selection).toEqual({ startMinute: at(14), endMinute: at(15, 30) });
  });

  it("mover para cima inverte sem mover a âncora", () => {
    const started = startSelection(DAY, y(15, 30), GEOMETRY);
    const moved = moveSelection(started, y(14), GEOMETRY);

    expect(moved.current?.selection).toEqual({ startMinute: at(14), endMinute: at(15, 30) });
    expect(moved.anchor?.minute).toBe(at(15, 30));
  });

  it("vários movimentos seguidos não deslocam a âncora", () => {
    let state = startSelection(DAY, y(14), GEOMETRY);
    for (const target of [y(15), y(16, 30), y(13), y(14, 45)]) {
      state = moveSelection(state, target, GEOMETRY);
      expect(state.anchor?.minute).toBe(at(14));
    }
  });

  it("mover sem ter começado é ignorado", () => {
    // Um evento atrasado não pode inaugurar uma seleção.
    expect(moveSelection(IDLE_SELECTION, y(15), GEOMETRY)).toBe(IDLE_SELECTION);
  });

  it("mover depois de cancelar é ignorado", () => {
    const started = startSelection(DAY, y(14), GEOMETRY);
    expect(started.current).not.toBeNull();

    const cancelled = cancelSelection();
    expect(moveSelection(cancelled, y(16), GEOMETRY).current).toBeNull();
  });

  it("a coluna é sempre a da âncora, mesmo arrastando na diagonal", () => {
    const started = startSelection(DAY, y(14), GEOMETRY);
    const moved = moveSelection(started, y(16), GEOMETRY);

    expect(moved.current?.date).toBe(DAY);
    expect(moved.current?.date).not.toBe(OTHER_DAY);
  });
});

describe("terminar", () => {
  it("confirma o intervalo desenhado e volta ao repouso", () => {
    const started = startSelection(DAY, y(14), GEOMETRY);
    const moved = moveSelection(started, y(15, 30), GEOMETRY);
    const { state, committed } = finishSelection(moved);

    expect(committed).toEqual({
      date: DAY,
      selection: { startMinute: at(14), endMinute: at(15, 30) },
    });
    expect(state).toEqual(IDLE_SELECTION);
  });

  it("um toque sem arrastar confirma o intervalo mínimo", () => {
    const { committed } = finishSelection(startSelection(DAY, y(9), GEOMETRY));

    expect(committed?.selection).toEqual({ startMinute: at(9), endMinute: at(9, 15) });
  });

  it("terminar sem ter começado não confirma nada", () => {
    // É isto que impede um `pointerup` perdido de criar agendamento.
    expect(finishSelection(IDLE_SELECTION).committed).toBeNull();
  });

  it("terminar depois de cancelar não confirma nada", () => {
    const started = startSelection(DAY, y(14), GEOMETRY);
    moveSelection(started, y(16), GEOMETRY);

    expect(finishSelection(cancelSelection()).committed).toBeNull();
  });

  it("terminar duas vezes não confirma duas vezes", () => {
    const started = startSelection(DAY, y(14), GEOMETRY);
    const first = finishSelection(started);
    const second = finishSelection(first.state);

    expect(first.committed).not.toBeNull();
    expect(second.committed).toBeNull();
  });
});

describe("cancelar", () => {
  it("apaga a seleção sem confirmar", () => {
    const started = startSelection(DAY, y(14), GEOMETRY);
    const moved = moveSelection(started, y(15, 30), GEOMETRY);

    expect(moved.current).not.toBeNull();
    expect(cancelSelection()).toEqual(IDLE_SELECTION);
  });

  it("cancelar do repouso é inofensivo", () => {
    expect(cancelSelection()).toEqual(IDLE_SELECTION);
  });
});

describe("um gesto novo durante outro", () => {
  it("recomeça do zero em vez de somar às âncoras antigas", () => {
    const first = startSelection(DAY, y(14), GEOMETRY);
    const moved = moveSelection(first, y(16), GEOMETRY);
    const second = startSelection(OTHER_DAY, y(9), GEOMETRY);

    expect(second.anchor).toEqual({ date: OTHER_DAY, minute: at(9) });
    expect(second.current?.date).toBe(OTHER_DAY);
    expect(moved.current?.date).toBe(DAY);
  });
});

describe("geometria da semana", () => {
  const weekGeometry: SelectionGeometry = { ...GEOMETRY, pixelsPerMinute: 1 };

  it("a mesma sequência funciona em outra escala", () => {
    const started = startSelection(DAY, (at(14) - BOUNDS.minMinute) * 1, weekGeometry);
    const moved = moveSelection(started, (at(15, 30) - BOUNDS.minMinute) * 1, weekGeometry);

    expect(moved.current?.selection).toEqual({ startMinute: at(14), endMinute: at(15, 30) });
  });
});

describe("isSameSelectedInterval", () => {
  const base = { date: DAY, selection: { startMinute: at(14), endMinute: at(15) } };

  it("compara data e intervalo", () => {
    expect(isSameSelectedInterval(base, { ...base })).toBe(true);
    expect(isSameSelectedInterval(base, { ...base, date: OTHER_DAY })).toBe(false);
    expect(
      isSameSelectedInterval(base, { date: DAY, selection: { startMinute: at(14), endMinute: at(16) } }),
    ).toBe(false);
  });

  it("trata a ausência de seleção", () => {
    expect(isSameSelectedInterval(null, null)).toBe(true);
    expect(isSameSelectedInterval(base, null)).toBe(false);
  });
});
