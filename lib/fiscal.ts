/**
 * Italian VAT (IVA) helpers.
 *
 * Consumer prices in the catalogue are stored **VAT-inclusive** (gross), as is
 * customary for B2C sales in Italy. VAT rates are stored in basis points
 * (`vatRateBps`): 400 = 4 %, 500 = 5 %, 1000 = 10 %, 2200 = 22 %.
 *
 * All money is integer cents. From a gross amount the taxable base (imponibile)
 * and the tax (imposta) are derived so that `imponibile + imposta === gross`
 * exactly — no rounding drift.
 */

/** The standard Italian IVA rates, most-common-for-food first. */
export const VAT_RATES_BPS = [400, 500, 1000, 2200] as const;
export type VatRateBps = (typeof VAT_RATES_BPS)[number];

/** Percent label for a bps rate, e.g. 2200 → "22%". */
export function vatRateLabel(bps: number): string {
  return `${bps / 100}%`;
}

/** Given a VAT-inclusive gross amount and a rate (bps), split it into the
 *  taxable base and the tax, exactly (imponibile + imposta === gross). */
export function splitGross(grossCents: number, rateBps: number): {
  imponibileCents: number;
  impostaCents: number;
} {
  // imponibile = gross / (1 + rate). Rounded to the cent; imposta is the
  // remainder so the two always re-sum to the gross.
  const imponibileCents = Math.round((grossCents * 10000) / (10000 + rateBps));
  return { imponibileCents, impostaCents: grossCents - imponibileCents };
}

export type VatLine = { grossCents: number; vatRateBps: number };

export type VatBucket = {
  rateBps: number;
  grossCents: number;
  imponibileCents: number;
  impostaCents: number;
};

/**
 * Aggregate a set of gross lines into one bucket per VAT rate, each carrying the
 * gross, taxable base and tax. Buckets are ordered by ascending rate. Suitable
 * both for a single order's receipt breakdown and for a period IVA report.
 */
export function vatBreakdown(lines: VatLine[]): VatBucket[] {
  const byRate = new Map<number, number>();
  for (const l of lines) {
    if (!l.grossCents) continue;
    byRate.set(l.vatRateBps, (byRate.get(l.vatRateBps) ?? 0) + l.grossCents);
  }
  return [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rateBps, grossCents]) => {
      const { imponibileCents, impostaCents } = splitGross(grossCents, rateBps);
      return { rateBps, grossCents, imponibileCents, impostaCents };
    });
}

/** Total tax across every bucket. */
export function totalImposta(buckets: VatBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.impostaCents, 0);
}
