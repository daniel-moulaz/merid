import { CONFLICT_POLICY, evaluateConflicts } from "./conflict-policy";
import type { Interval } from "./overlap";

const at = (iso: string): Date => new Date(`2026-08-29T${iso}:00.000Z`);
const interval = (start: string, end: string): Interval => ({
  startsAt: at(start),
  endsAt: at(end),
});
const withId = (id: string, start: string, end: string) => ({ id, ...interval(start, end) });

const existing = [withId("aeds", "14:00", "15:30"), withId("projeto", "09:00", "10:30")];

describe("política de conflito do MVP", () => {
  it("a política vigente é AVISAR, não bloquear", () => {
    // Sobreposição pode ser intencional. Se este valor mudar, é uma decisão de
    // produto — e é aqui, em um lugar só, que ela muda.
    expect(CONFLICT_POLICY).toBe("WARN");
  });

  it("horário livre segue direto", () => {
    const result = evaluateConflicts(interval("11:00", "12:00"), existing);

    expect(result.decision).toBe("PROCEED");
    expect(result.conflicts).toEqual([]);
  });

  it("bloco encostado NÃO é conflito", () => {
    expect(evaluateConflicts(interval("15:30", "16:30"), existing).decision).toBe("PROCEED");
  });

  it("sobreposição pede confirmação e diz QUAL bloco conflita", () => {
    const result = evaluateConflicts(interval("15:00", "16:00"), existing);

    expect(result.decision).toBe("CONFIRM");
    expect(result.conflicts.map((block) => block.id)).toEqual(["aeds"]);
  });

  it("relata todos os blocos conflitantes", () => {
    const result = evaluateConflicts(interval("09:00", "16:00"), existing);

    expect(result.decision).toBe("CONFIRM");
    expect(result.conflicts.map((block) => block.id).sort()).toEqual(["aeds", "projeto"]);
  });

  it("ao editar, o próprio bloco é ignorado", () => {
    const result = evaluateConflicts(interval("14:00", "15:30"), existing, {
      excludeId: "aeds",
    });

    expect(result.decision).toBe("PROCEED");
  });
});

describe("a política é trocável em um lugar só", () => {
  it("BLOCK recusa o agendamento", () => {
    const result = evaluateConflicts(interval("15:00", "16:00"), existing, {
      policy: "BLOCK",
    });

    expect(result.decision).toBe("REJECT");
    expect(result.conflicts.map((block) => block.id)).toEqual(["aeds"]);
  });

  it("ALLOW nem chega a procurar conflito", () => {
    const result = evaluateConflicts(interval("15:00", "16:00"), existing, {
      policy: "ALLOW",
    });

    expect(result.decision).toBe("PROCEED");
    expect(result.conflicts).toEqual([]);
  });

  it("sem conflito, as três políticas concordam", () => {
    for (const policy of ["ALLOW", "WARN", "BLOCK"] as const) {
      expect(evaluateConflicts(interval("11:00", "12:00"), existing, { policy }).decision).toBe(
        "PROCEED",
      );
    }
  });
});
