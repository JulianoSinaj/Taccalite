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

/**
 * Distribute an integer `total` across `weights` proportionally, using the
 * largest-remainder method so the returned integer parts sum **exactly** to
 * `total` (no cent created or lost). `total` must not exceed the weight sum.
 */
export function apportion(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sumW <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sumW);
  const parts = exact.map((x) => Math.floor(x));
  let assigned = parts.reduce((s, x) => s + x, 0);
  // Hand out the leftover cents to the largest fractional remainders first.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (assigned < total && k < n * 2) {
    parts[order[k % n].i] += 1;
    assigned += 1;
    k += 1;
  }
  return parts;
}

export type OrderVatInput = {
  /** Line grosses (VAT-inclusive) with their snapshot rate. */
  items: VatLine[];
  /** Cart-level discount in cents (≥ 0), apportioned across the rate buckets. */
  discountCents: number;
  /** Shipping charged in cents (≥ 0), added under `shippingVatBps`. */
  shippingCents: number;
  /** VAT rate (bps) applied to shipping. */
  shippingVatBps: number;
};

/**
 * Reconciled VAT buckets for a single order. Starts from the line grosses, then:
 *  1. apportions the cart discount across rate buckets pro-rata to each bucket's
 *     share of the pre-discount subtotal (largest-remainder, exact to the cent);
 *  2. adds shipping under its own rate.
 * The sum of bucket grosses therefore equals `subtotal − discount + shipping` =
 * the order total, so `imponibile + imposta` reconciles with what the customer
 * actually paid — unlike a raw line-gross breakdown, which ignores both.
 */
export function orderVatBuckets(input: OrderVatInput): VatBucket[] {
  const byRate = new Map<number, number>();
  for (const l of input.items) {
    if (!l.grossCents) continue;
    byRate.set(l.vatRateBps, (byRate.get(l.vatRateBps) ?? 0) + l.grossCents);
  }
  const rates = [...byRate.keys()];
  const grosses = rates.map((r) => byRate.get(r)!);
  const subtotal = grosses.reduce((s, g) => s + g, 0);

  // Never let a bogus discount exceed the goods subtotal.
  const discount = Math.min(Math.max(0, Math.round(input.discountCents)), subtotal);
  const discountByRate = apportion(discount, grosses);

  const netByRate = new Map<number, number>();
  rates.forEach((r, i) => netByRate.set(r, grosses[i] - discountByRate[i]));

  const shipping = Math.max(0, Math.round(input.shippingCents));
  if (shipping > 0) {
    netByRate.set(input.shippingVatBps, (netByRate.get(input.shippingVatBps) ?? 0) + shipping);
  }

  return [...netByRate.entries()]
    .filter(([, g]) => g > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([rateBps, grossCents]) => {
      const { imponibileCents, impostaCents } = splitGross(grossCents, rateBps);
      return { rateBps, grossCents, imponibileCents, impostaCents };
    });
}

/** Sum several orders' buckets into one bucket per rate (for a period report). */
export function aggregateVatBuckets(perOrder: VatBucket[][]): VatBucket[] {
  const byRate = new Map<number, VatBucket>();
  for (const buckets of perOrder) {
    for (const b of buckets) {
      const cur = byRate.get(b.rateBps);
      if (cur) {
        cur.grossCents += b.grossCents;
        cur.imponibileCents += b.imponibileCents;
        cur.impostaCents += b.impostaCents;
      } else {
        byRate.set(b.rateBps, { ...b });
      }
    }
  }
  return [...byRate.values()].sort((a, b) => a.rateBps - b.rateBps);
}
