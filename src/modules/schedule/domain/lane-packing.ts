/**
 * Distribuição de itens sobrepostos em COLUNAS — o algoritmo de calendário.
 *
 * Mora num módulo próprio porque as duas telas precisam dele mas derivam os
 * minutos de formas diferentes:
 *
 *   Hoje    minutos DECORRIDOS desde o início do dia do usuário (uma coluna,
 *           régua adaptativa: honesta em dia de horário de verão);
 *   Semana  minutos do RELÓGIO local (sete colunas dividindo uma régua só,
 *           que precisa ser verdadeira para todas).
 *
 * Este módulo não sabe de onde vieram os minutos, e é justamente isso que
 * permite compartilhá-lo sem transformar as duas telas em um componente
 * genérico cheio de condicionais.
 */

export type LaneEntry = {
  readonly id: string;
  readonly startMinute: number;
  /** Exclusivo: [startMinute, endMinute). Itens que se tocam não conflitam. */
  readonly endMinute: number;
};

export type Packed<T extends LaneEntry> = T & {
  /** Coluna ocupada dentro do grupo de sobrepostos (base 0). */
  readonly lane: number;
  /** Quantas colunas o grupo precisou. Largura do card = 1 / laneCount. */
  readonly laneCount: number;
  /** `true` quando este item realmente sobrepõe algum outro do mesmo grupo. */
  readonly hasConflict: boolean;
};

/** Sobreposição de intervalos semiabertos, em minutos. */
function overlapsInMinutes(a: LaneEntry, b: LaneEntry): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * Agrupa itens sobrepostos (direta ou transitivamente) e dá a cada um a
 * primeira coluna livre naquele instante; todos do grupo dividem a largura.
 *
 * Alternativas descartadas: desenhar um por cima do outro (esconde informação)
 * e deslocar com sombra (fica ambíguo com três ou mais itens).
 *
 * Itens de duração não positiva são descartados: não ocupam tempo e o banco
 * não os aceita.
 */
export function packIntoLanes<T extends LaneEntry>(entries: readonly T[]): Packed<T>[] {
  const sorted = entries
    .filter((entry) => entry.endMinute > entry.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);

  const packed: Packed<T>[] = [];

  // Um grupo termina quando um item começa depois do fim de TODOS os
  // anteriores do grupo — daí guardarmos o maior fim visto até aqui.
  let group: { readonly entry: T; readonly lane: number }[] = [];
  let groupEndsAt = Number.NEGATIVE_INFINITY;
  let laneEnds: number[] = [];

  const flush = (): void => {
    if (group.length === 0) return;
    const laneCount = laneEnds.length;

    for (const { entry, lane } of group) {
      // O conflito é procurado dentro do GRUPO: itens de grupos diferentes,
      // por definição, não se sobrepõem.
      const hasConflict = group.some(
        (other) => other.entry.id !== entry.id && overlapsInMinutes(entry, other.entry),
      );
      packed.push({ ...entry, lane, laneCount, hasConflict });
    }

    group = [];
    laneEnds = [];
    groupEndsAt = Number.NEGATIVE_INFINITY;
  };

  for (const entry of sorted) {
    if (entry.startMinute >= groupEndsAt) flush();

    let lane = laneEnds.findIndex((end) => end <= entry.startMinute);
    if (lane === -1) lane = laneEnds.length;

    laneEnds[lane] = entry.endMinute;
    group.push({ entry, lane });
    groupEndsAt = Math.max(groupEndsAt, entry.endMinute);
  }

  flush();

  return packed;
}
