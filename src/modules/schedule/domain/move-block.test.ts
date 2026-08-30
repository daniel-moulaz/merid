import type { SelectionBounds } from "./interval-selection";
import { canDragToMove, hasMoved, moveInterval } from "./move-block";

/**
 * A suíte roda em Pacific/Kiritimati (UTC+14) — ver jest.config.js. Mover é
 * aritmética de minutos civis; nada aqui pode depender de fuso ou relógio.
 */

const WINDOW: SelectionBounds = { minMinute: 6 * 60, maxMinute: 23 * 60 };
const at = (hour: number, minute = 0) => hour * 60 + minute;

/** 14:00 → 15:30, o bloco do enunciado. */
const BLOCK = { startMinute: at(14), endMinute: at(15, 30) };

describe("moveInterval", () => {
  it("desloca o bloco preservando a duração", () => {
    expect(moveInterval(BLOCK, 120, WINDOW)).toEqual({
      startMinute: at(16),
      endMinute: at(17, 30),
    });
  });

  it("move para trás com a mesma regra", () => {
    expect(moveInterval(BLOCK, -60, WINDOW)).toEqual({
      startMinute: at(13),
      endMinute: at(14, 30),
    });
  });

  it("encaixa o início na grade, pelo passo mais próximo", () => {
    // 14:00 + 37 min = 14:37 — mais perto de 14:30 do que de 14:45.
    expect(moveInterval(BLOCK, 37, WINDOW)).toEqual({
      startMinute: at(14, 30),
      endMinute: at(16),
    });

    // 14:00 + 40 min = 14:40, e aí o vizinho mais próximo é 14:45.
    expect(moveInterval(BLOCK, 40, WINDOW).startMinute).toBe(at(14, 45));
  });

  it("preserva duração que não é múltipla do passo", () => {
    const odd = { startMinute: at(9), endMinute: at(9, 50) };
    const moved = moveInterval(odd, 60, WINDOW);

    expect(moved.endMinute - moved.startMinute).toBe(50);
  });

  it("delta zero devolve o mesmo intervalo", () => {
    expect(moveInterval(BLOCK, 0, WINDOW)).toEqual(BLOCK);
  });

  it("a duração é invariante para qualquer delta", () => {
    for (let delta = -600; delta <= 600; delta += 17) {
      const moved = moveInterval(BLOCK, delta, WINDOW);
      expect(moved.endMinute - moved.startMinute).toBe(90);
    }
  });
});

describe("moveInterval — bordas", () => {
  /**
   * A regra que evita a pior resposta possível: encostar na borda PARA o
   * bloco, nunca o encurta. Quem pediu para mover não pediu para diminuir.
   */
  it("para na borda de baixo sem encurtar", () => {
    const moved = moveInterval(BLOCK, 10_000, WINDOW);

    expect(moved.endMinute).toBe(WINDOW.maxMinute);
    expect(moved.endMinute - moved.startMinute).toBe(90);
  });

  it("para na borda de cima sem encurtar", () => {
    const moved = moveInterval(BLOCK, -10_000, WINDOW);

    expect(moved.startMinute).toBe(WINDOW.minMinute);
    expect(moved.endMinute - moved.startMinute).toBe(90);
  });

  it("qualquer delta mantém o bloco dentro da janela", () => {
    for (const delta of [-5000, -300, -1, 0, 1, 300, 5000]) {
      const moved = moveInterval(BLOCK, delta, WINDOW);

      expect(moved.startMinute).toBeGreaterThanOrEqual(WINDOW.minMinute);
      expect(moved.endMinute).toBeLessThanOrEqual(WINDOW.maxMinute);
    }
  });

  it("janela menor que o bloco devolve a janela inteira, sem inverter", () => {
    const tiny: SelectionBounds = { minMinute: at(10), maxMinute: at(10, 30) };
    const moved = moveInterval(BLOCK, 0, tiny);

    expect(moved.startMinute).toBeLessThan(moved.endMinute);
    expect(moved).toEqual({ startMinute: at(10), endMinute: at(10, 30) });
  });
});

describe("hasMoved", () => {
  it("reconhece que nada mudou", () => {
    expect(hasMoved(BLOCK, moveInterval(BLOCK, 0, WINDOW))).toBe(false);
  });

  it("um arrasto dentro do mesmo passo não conta como mudança", () => {
    // 3 minutos encaixam de volta em 14:00: nada para salvar.
    expect(hasMoved(BLOCK, moveInterval(BLOCK, 3, WINDOW))).toBe(false);
  });

  it("reconhece a mudança real", () => {
    expect(hasMoved(BLOCK, moveInterval(BLOCK, 15, WINDOW))).toBe(true);
  });
});

describe("canDragToMove", () => {
  it("permite arrastar um bloco inteiro", () => {
    expect(canDragToMove({ continuesBefore: false, continuesAfter: false })).toBe(true);
  });

  it("recusa um segmento de bloco que atravessa a meia-noite", () => {
    // Arrastar meio bloco não tem significado: a entidade é uma só.
    expect(canDragToMove({ continuesBefore: true, continuesAfter: false })).toBe(false);
    expect(canDragToMove({ continuesBefore: false, continuesAfter: true })).toBe(false);
  });
});
