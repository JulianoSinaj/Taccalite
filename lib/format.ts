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
