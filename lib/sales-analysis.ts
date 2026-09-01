import { splitGross } from "@/lib/fiscal";

/**
 * Sales and margin analysis — the arithmetic, with no database in it.
 *
 * The gestionale could say what it took and never what it kept: `margin()` in
 * `lib/inventory.ts` was rendered for one product at a time and aggregated
 * nowhere, so the shop could see turnover and not profit. This is the piece that
 * adds up.
 *
 * Three rules the numbers depend on, all of them choices:
 *
 *  1. **Margin is computed on the taxable base, never on the shelf price.**
 *     Consumer prices here are VAT-inclusive and `cost_cents` is not, so
 *     subtracting one from the other overstates the margin by the whole VAT
 *     rate — a 10% product would read four points better than it is. Every line
 *     goes through `splitGross` first.
 *
 *  2. **An order-level discount is spread across that order's lines, in
 *     proportion to what each line contributed.** A coupon is taken off the
 *     basket, not off a product, so charging it to one category would flatter
 *     the others. The alternative — reporting margin gross of discounts — quietly
 *     overstates every figure on the page by exactly the coupon budget.
 *
 *  3. **Lines whose product has no cost are excluded from the margin, and
 *     counted.** They still contribute to revenue. Averaging them in as though
 *     they cost nothing would invent margin; dropping them silently would invent
 *     a percentage that looks like it describes the whole period. `coverage`
 *     exists so the page can say which it is.
 *
 * Shipping is not merchandise and is not here: it has its own VAT rate, it is
 * a pass-through rather than a sale, and including it would move the margin of
 * every category by how far the customer lives from the shop.
 */

export type SaleLine = {
  orderId: string;
  shopSlug: string | null;
  productId: string | null;
  productName: string;
  /** Catalogue category name; "" when the product is gone or uncategorised. */
  category: string;
  vatRateBps: number;
  /** Gross for the line, VAT-inclusive, BEFORE any order-level discount. */
  lineTotalCents: number;
  quantity: number;
  /** Set for a line sold by weight; then it, not `quantity`, is the amount. */
  weightKg: number | null;
  /**
   * Current catalogue cost per unit, VAT-excluded. Null when the product has no
   * cost recorded, or no longer exists.
   *
   * Deliberately the cost *now*, not the cost then: `order_items` snapshots the
   * price and the VAT rate but never the cost, so there is no historical figure
   * to use. For a period whose buying prices have moved this is an
   * approximation, and the page says so rather than implying a precision the
   * data does not have.
   */
  unitCostCents: number | null;
};

/** The order-level figures a line needs to know about, keyed by order id. */
export type OrderContext = {
  id: string;
  subtotalCents: number;
  /** Coupon + any manual reduction, i.e. `orders.discountCents`. */
  discountCents: number;
};

export type SalesGroup = {
  key: string;
  label: string;
  /** VAT-inclusive merchandise revenue, after discount allocation. */
  grossCents: number;
  /** Taxable base of the above — what the shop actually books. */
  netCents: number;
  /** Taxable base of only those lines whose cost is known. */
  costedNetCents: number;
  costCents: number;
  /** `costedNetCents − costCents`. Meaningless unless `costedNetCents > 0`. */
  marginCents: number;
  /** Units moved: kilos for a weight line, pieces otherwise. */
  units: number;
  lines: number;
  /** Lines with no cost on the product — the ones outside the margin. */
  uncostedLines: number;
};

export type SalesTotals = SalesGroup & {
  orders: number;
  /** Share of net revenue the margin actually describes, 0–1. */
  coverage: number;
};

export type SalesAnalysis = {
  totals: SalesTotals;
  byCategory: SalesGroup[];
  byProduct: SalesGroup[];
  byShop: SalesGroup[];
};

/** Margin as a percentage of the taxable base, or null when there is no base. */
export function marginPct(g: { costedNetCents: number; marginCents: number }): number | null {
  if (g.costedNetCents <= 0) return null;
  return Math.round((g.marginCents / g.costedNetCents) * 100);
}

/** Kilos for a weight line, pieces otherwise. */
export function lineUnits(l: Pick<SaleLine, "quantity" | "weightKg">): number {
  return l.weightKg != null ? l.weightKg : l.quantity;
}

function empty(key: string, label: string): SalesGroup {
  return {
    key,
    label,
    grossCents: 0,
    netCents: 0,
    costedNetCents: 0,
    costCents: 0,
    marginCents: 0,
    units: 0,
    lines: 0,
    uncostedLines: 0,
  };
}

function add(g: SalesGroup, l: SaleLine, grossCents: number, netCents: number, units: number) {
  g.grossCents += grossCents;
  g.netCents += netCents;
  g.units += units;
  g.lines += 1;
  if (l.unitCostCents == null) {
    g.uncostedLines += 1;
    return;
  }
  const cost = Math.round(l.unitCostCents * units);
  g.costCents += cost;
  g.costedNetCents += netCents;
  g.marginCents += netCents - cost;
}

function intoBucket(
  map: Map<string, SalesGroup>,
  key: string,
  label: string,
  l: SaleLine,
  gross: number,
  net: number,
  units: number,
) {
  let g = map.get(key);
  if (!g) {
    g = empty(key, label);
    map.set(key, g);
  }
  add(g, l, gross, net, units);
}

/** Biggest revenue first — the order every one of these tables wants. */
const byRevenue = (a: SalesGroup, b: SalesGroup) =>
  b.grossCents - a.grossCents || a.label.localeCompare(b.label, "it");

export function analyseSales(
  lines: SaleLine[],
  orders: OrderContext[],
  opts: { shopLabel?: (slug: string | null) => string } = {},
): SalesAnalysis {
  // Discount allocation factor per order: what fraction of each line survives.
  // Guarded on the subtotal because a fully-discounted basket (subtotal ===
  // discount) is representable, and dividing by it is not.
  const factor = new Map<string, number>();
  for (const o of orders) {
    const f =
      o.discountCents > 0 && o.subtotalCents > 0
        ? Math.max(0, 1 - o.discountCents / o.subtotalCents)
        : 1;
    factor.set(o.id, f);
  }

  const totals = empty("totals", "Totale");
  const cat = new Map<string, SalesGroup>();
  const prod = new Map<string, SalesGroup>();
  const shop = new Map<string, SalesGroup>();
  const seenOrders = new Set<string>();

  for (const l of lines) {
    const f = factor.get(l.orderId) ?? 1;
    const gross = Math.round(l.lineTotalCents * f);
    const net = splitGross(gross, l.vatRateBps).imponibileCents;
    const units = lineUnits(l);
    seenOrders.add(l.orderId);

    add(totals, l, gross, net, units);
    intoBucket(cat, l.category || "—", l.category || "Senza categoria", l, gross, net, units);
    // Keyed on the product id where there is one: two products may share a name,
    // and a renamed product must not split into two rows.
    intoBucket(prod, l.productId ?? `n:${l.productName}`, l.productName, l, gross, net, units);
    const slug = l.shopSlug ?? "";
    intoBucket(shop, slug, opts.shopLabel?.(l.shopSlug) ?? (l.shopSlug || "Senza sede"), l, gross, net, units);
  }

  return {
    totals: {
      ...totals,
      orders: seenOrders.size,
      coverage: totals.netCents > 0 ? totals.costedNetCents / totals.netCents : 0,
    },
    byCategory: [...cat.values()].sort(byRevenue),
    byProduct: [...prod.values()].sort(byRevenue),
    byShop: [...shop.values()].sort(byRevenue),
  };
}
