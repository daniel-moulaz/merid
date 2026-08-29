/**
 * Duração em minutos — o produto trata duração como cidadã de primeira classe.
 */

export const MIN_ESTIMATED_MINUTES = 1;
/** 24h. Também aplicado como CHECK no banco. */
export const MAX_ESTIMATED_MINUTES = 1440;
export const DEFAULT_ESTIMATED_MINUTES = 30;

/**
 * Formata minutos de forma compacta: 45 -> "45 min", 60 -> "1h", 90 -> "1h30".
 */
export function formatMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new TypeError(`minutos precisa ser inteiro não-negativo, recebido: ${minutes}`);
  }
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, "0")}`;
}

/** Duração de um bloco de agenda, em minutos. Intervalo semiaberto. */
export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}
