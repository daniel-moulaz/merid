/**
 * Sobreposição de intervalos — função pura, sem React e sem banco.
 *
 * O produto usa INTERVALO SEMIABERTO: [startsAt, endsAt).
 *
 *   14:00 → 15:00  e  15:00 → 16:00   NÃO conflitam
 *
 * Sem essa regra todo bloco encostado no anterior viraria falso conflito, e o
 * usuário aprenderia a ignorar o aviso.
 */

export type Interval = {
  readonly startsAt: Date;
  readonly endsAt: Date;
};

/**
 * Um intervalo é válido quando as duas pontas são datas reais e a duração é
 * positiva. É a mesma invariante da CHECK constraint `ends_at > starts_at`.
 */
export function isValidInterval(interval: Interval): boolean {
  const start = interval.startsAt.getTime();
  const end = interval.endsAt.getTime();

  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return end > start;
}

/**
 * Dois intervalos se sobrepõem quando cada um começa antes de o outro terminar.
 *
 *   a.start < b.end  &&  b.start < a.end
 *
 * O `<` estrito (em vez de `<=`) é o que torna o intervalo semiaberto: bordas
 * que apenas se tocam não são conflito.
 *
 * Intervalo inválido nunca conflita: um intervalo de duração zero ou negativa
 * não ocupa tempo nenhum, e tratá-lo como conflitante produziria avisos sobre
 * dado que o banco vai recusar de qualquer forma.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  if (!isValidInterval(a) || !isValidInterval(b)) return false;

  return (
    a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime()
  );
}

/** Minutos de interseção entre dois intervalos. Zero quando não se sobrepõem. */
export function overlapMinutes(a: Interval, b: Interval): number {
  if (!overlaps(a, b)) return 0;

  const start = Math.max(a.startsAt.getTime(), b.startsAt.getTime());
  const end = Math.min(a.endsAt.getTime(), b.endsAt.getTime());
  return Math.round((end - start) / 60_000);
}

/**
 * Quais dos intervalos existentes conflitam com o candidato.
 *
 * `excludeId` existe para EDIÇÃO: ao mover um bloco, ele não pode conflitar
 * consigo mesmo. Sem isso, toda edição avisaria de um conflito inexistente.
 */
export function findOverlapping<T extends Interval & { readonly id: string }>(
  candidate: Interval,
  existing: readonly T[],
  options: { readonly excludeId?: string | undefined } = {},
): T[] {
  return existing.filter(
    (item) => item.id !== options.excludeId && overlaps(candidate, item),
  );
}

/** Ordem cronológica; empate desempatado pelo fim (o mais curto primeiro). */
export function compareIntervals(a: Interval, b: Interval): number {
  const byStart = a.startsAt.getTime() - b.startsAt.getTime();
  return byStart !== 0 ? byStart : a.endsAt.getTime() - b.endsAt.getTime();
}
