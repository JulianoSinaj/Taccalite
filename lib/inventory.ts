import { splitGross } from "@/lib/fiscal";

/**
 * Inventory thresholds and margin.
 *
 * A product may carry its own `reorderPoint`; when it doesn't, the shop-wide
 * `store.lowStockThreshold` applies. Every surface that says "scorte basse" —
 * the catalogue badge and filter, the owner digest, the post-order alert — goes
 * through here so they can't drift apart.
 */

export type StockFields = { stock: number | null; reorderPoint: number | null };

/** The threshold that actually applies to a product. */
export function reorderPointFor(p: { reorderPoint: number | null }, globalThreshold: number): number {
  return p.reorderPoint ?? globalThreshold;
}

/** True when a stock-tracking product is at or under its reorder point.
 *  A null stock means unlimited / made-to-order, which is never low. */
export function isLowStock(p: StockFields, globalThreshold: number): boolean {
  return p.stock != null && p.stock <= reorderPointFor(p, globalThreshold);
}

/**
 * Gross margin on a sale, from the VAT-exclusive taxable base (what the shop
 * actually keeps) minus the purchase cost. Consumer prices are stored
 * VAT-inclusive, so comparing `priceCents` to `costCents` directly would
 * overstate the margin by the VAT rate.
 *
 * Returns null when there's nothing to compute from.
 */
export function margin(p: {
  priceCents: number | null;
  costCents: number | null;
  vatRateBps: number;
}): { netCents: number; marginCents: number; marginPct: number } | null {
  if (p.priceCents == null || p.costCents == null || p.priceCents <= 0) return null;
  const { imponibileCents } = splitGross(p.priceCents, p.vatRateBps);
  if (imponibileCents <= 0) return null;
  const marginCents = imponibileCents - p.costCents;
  return {
    netCents: imponibileCents,
    marginCents,
    marginPct: Math.round((marginCents / imponibileCents) * 100),
  };
}
