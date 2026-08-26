/** Formatting helpers usable from both server and client components. */

/**
 * Italian number formatting: comma for the decimal, dot for thousands.
 *
 * Built once at module scope — `Intl.NumberFormat` is expensive to construct and
 * this runs for every line of every cart.
 *
 * Only customer-facing prices come through here. The FatturaPA/SdI XML has its
 * own helper in `lib/fattura.ts` because the format there is dictated by the
 * schema (always a dot) and must not follow the display locale.
 */
const euro = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEuro(cents: number): string {
  return `€ ${euro.format(cents / 100)}`;
}

/**
 * Porchetta is booked in half-kilos: "1", "1,5", "12" — never "1.0" or "1.50".
 * Italian decimal comma, since it sits next to prices formatted the same way.
 */
export function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace(".", ",");
}

const shortDate = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * "adesso", "5 min fa", "2 ore fa", "ieri", else a short date — for the counter
 * screen, where "when was this card last credited?" is a same-shift question.
 * `now` is passed in so callers render deterministically.
 */
export function formatRelativeTime(value: Date | string | number, now: number): string {
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const minutes = Math.floor(Math.max(0, now - t) / 60_000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 ora fa" : `${hours} ore fa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ieri";
  if (days < 7) return `${days} giorni fa`;
  return shortDate.format(t);
}
