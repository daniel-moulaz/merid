import { findOverlapping, type Interval } from "./overlap";

/**
 * -------------------------------------------------------------------------
 * A política de conflito do produto — decidida em UM lugar.
 * -------------------------------------------------------------------------
 *
 * Sobreposição pode ser INTENCIONAL: "vou estudar enquanto a máquina roda",
 * "essa reunião eu acompanho de ouvido". Um app que simplesmente recusa força o
 * usuário a mentir para o próprio planejamento.
 *
 * No MVP, portanto: detectar, avisar, mostrar QUAL bloco conflita, e deixar o
 * usuário decidir — [Voltar] ou [Agendar mesmo assim].
 *
 * Esta constante existe para que trocar a política no futuro (bloquear, ou
 * sugerir automaticamente outro horário) seja uma linha aqui, e não uma caça a
 * `if` espalhados por formulários e telas. Nenhum componente decide isso.
 */
export const CONFLICT_POLICY = "WARN" as const;

export type ConflictPolicy = "ALLOW" | "WARN" | "BLOCK";

/** O que a UI deve fazer com o resultado da avaliação. */
export type ConflictDecision =
  /** Sem conflito, ou política de ignorar: pode salvar direto. */
  | "PROCEED"
  /** Há conflito: mostrar quais e pedir confirmação explícita. */
  | "CONFIRM"
  /** Há conflito e a política proíbe: não salvar. */
  | "REJECT";

export type ConflictEvaluation<T> = {
  readonly decision: ConflictDecision;
  /** Os blocos que conflitam, em ordem cronológica. Vazio quando não há. */
  readonly conflicts: readonly T[];
};

/**
 * Avalia um horário candidato contra os blocos já existentes.
 *
 * `excludeId` é o bloco sendo editado: ele nunca conflita consigo mesmo.
 */
export function evaluateConflicts<T extends Interval & { readonly id: string }>(
  candidate: Interval,
  existing: readonly T[],
  options: {
    readonly excludeId?: string | undefined;
    readonly policy?: ConflictPolicy;
  } = {},
): ConflictEvaluation<T> {
  const policy = options.policy ?? CONFLICT_POLICY;

  if (policy === "ALLOW") return { decision: "PROCEED", conflicts: [] };

  const conflicts = findOverlapping(candidate, existing, { excludeId: options.excludeId });

  if (conflicts.length === 0) return { decision: "PROCEED", conflicts: [] };

  return {
    decision: policy === "BLOCK" ? "REJECT" : "CONFIRM",
    conflicts,
  };
}
