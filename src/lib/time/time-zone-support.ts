import { toCalendarDateInTimeZone } from "./time-zone";

/**
 * Verificação de capacidade do runtime para timezones IANA.
 *
 * Toda a noção de "dia" do produto depende de `Intl.DateTimeFormat` aceitar uma
 * timezone IANA e expor `formatToParts`. Isso é garantido em navegadores e no
 * Node, mas em React Native depende da build do motor JavaScript (Hermes no
 * Android usa o ICU do sistema; versões antigas tinham suporte parcial).
 *
 * Se faltar, o sintoma seria silencioso e grave: tarefas aparecendo no dia
 * errado. Esta checagem transforma isso em erro visível na inicialização.
 *
 * Correção conhecida, caso algum dispositivo falhe: incluir os polyfills
 * `@formatjs/intl-locale`, `@formatjs/intl-datetimeformat` e os dados de
 * timezone, importados antes de qualquer código de data.
 */

export type TimeZoneSupport =
  | { readonly supported: true }
  | { readonly supported: false; readonly reason: string };

/** Instante que cai em dias diferentes em UTC e em São Paulo (UTC-3). */
const PROBE_INSTANT = new Date("2026-08-29T02:30:00.000Z");
const PROBE_TIME_ZONE = "America/Sao_Paulo";
const EXPECTED_CALENDAR_DATE = "2026-08-28";

export function detectTimeZoneSupport(): TimeZoneSupport {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat !== "function") {
    return { supported: false, reason: "Intl.DateTimeFormat não existe neste runtime." };
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: PROBE_TIME_ZONE });
  } catch {
    return {
      supported: false,
      reason: `Intl.DateTimeFormat não aceita a timezone IANA "${PROBE_TIME_ZONE}".`,
    };
  }

  if (typeof formatter.formatToParts !== "function") {
    return { supported: false, reason: "Intl.DateTimeFormat.formatToParts não existe." };
  }

  let actual: string;
  try {
    actual = toCalendarDateInTimeZone(PROBE_INSTANT, PROBE_TIME_ZONE);
  } catch (error) {
    return {
      supported: false,
      reason: `Conversão de instante para data civil falhou: ${String(error)}`,
    };
  }

  if (actual !== EXPECTED_CALENDAR_DATE) {
    return {
      supported: false,
      reason:
        `Conversão de timezone incorreta: ${PROBE_INSTANT.toISOString()} em ` +
        `${PROBE_TIME_ZONE} deveria ser ${EXPECTED_CALENDAR_DATE}, mas foi ${actual}.`,
    };
  }

  return { supported: true };
}

/**
 * Chamado uma vez na inicialização. Não derruba o app: registra um erro alto o
 * bastante para aparecer no log do dispositivo durante o desenvolvimento.
 */
export function warnIfTimeZoneUnsupported(): void {
  const support = detectTimeZoneSupport();
  if (support.supported) return;

  console.error(
    "[tempo] Este dispositivo não tem suporte confiável a timezones IANA. " +
      "Datas podem aparecer no dia errado. Motivo: " +
      support.reason,
  );
}
