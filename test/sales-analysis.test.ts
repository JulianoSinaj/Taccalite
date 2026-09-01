import { describe, it, expect } from "vitest";
import {
  analyseSales,
  marginPct,
  lineUnits,
  type SaleLine,
  type OrderContext,
} from "@/lib/sales-analysis";
import { splitGross } from "@/lib/fiscal";

/** A line with sane defaults; each test overrides only what it is about. */
function line(over: Partial<SaleLine> = {}): SaleLine {
  return {
    orderId: "o1",
    shopSlug: "centro",
    productId: "p1",
    productName: "Ciauscolo",
    category: "Salumi",
    vatRateBps: 1000,
    lineTotalCents: 1100,
    quantity: 1,
    weightKg: null,
    unitCostCents: 600,
    ...over,
  };
}

const order = (over: Partial<OrderContext> = {}): OrderContext => ({
  id: "o1",
  subtotalCents: 1100,
  discountCents: 0,
  ...over,
});

describe("lineUnits", () => {
  it("counts kilos for a weight line and pieces otherwise", () => {
    expect(lineUnits({ quantity: 3, weightKg: null })).toBe(3);
    // `quantity` stays 1 on a weight line, so reading it would undercount a
    // 2.4 kg cut to a single unit — and the cost with it.
    expect(lineUnits({ quantity: 1, weightKg: 2.4 })).toBe(2.4);
  });
});

describe("analyseSales — margin arithmetic", () => {
  it("computes margin on the taxable base, not on the shelf price", () => {
    const { totals } = analyseSales([line()], [order()]);
    // €11.00 gross at 10% → €10.00 taxable; cost €6.00 → €4.00 margin, 40%.
    expect(totals.netCents).toBe(1000);
    expect(totals.costCents).toBe(600);
    expect(totals.marginCents).toBe(400);
    expect(marginPct(totals)).toBe(40);
    // The trap this exists to avoid: 1100 − 600 = 500 would read as 45%.
    expect(totals.marginCents).not.toBe(500);
  });

  it("scales cost by kilos on a weight line", () => {
    const { totals } = analyseSales(
      [line({ lineTotalCents: 2200, weightKg: 2, unitCostCents: 600 })],
      [order({ subtotalCents: 2200 })],
    );
    expect(totals.units).toBe(2);
    expect(totals.costCents).toBe(1200);
    expect(totals.netCents).toBe(2000);
    expect(totals.marginCents).toBe(800);
  });

  it("spreads an order-level discount across that order's lines", () => {
    // €20 basket, €5 coupon → every line keeps 75%.
    const lines = [
      line({ productId: "a", productName: "A", category: "Salumi", lineTotalCents: 1000, unitCostCents: null }),
      line({ productId: "b", productName: "B", category: "Formaggi", lineTotalCents: 1000, unitCostCents: null }),
    ];
    const { totals, byCategory } = analyseSales(lines, [
      order({ subtotalCents: 2000, discountCents: 500 }),
    ]);
    expect(totals.grossCents).toBe(1500);
    // Charged proportionally rather than to whichever category came first.
    expect(byCategory.map((c) => c.grossCents)).toEqual([750, 750]);
  });

  it("never lets a fully-discounted basket produce negative revenue", () => {
    const { totals } = analyseSales(
      [line({ lineTotalCents: 1000, unitCostCents: null })],
      [order({ subtotalCents: 1000, discountCents: 4000 })],
    );
    expect(totals.grossCents).toBe(0);
  });

  it("survives a discount on an order with no subtotal", () => {
    // Guard against the division, not a realistic basket.
    const { totals } = analyseSales(
      [line({ lineTotalCents: 500, unitCostCents: null })],
      [order({ subtotalCents: 0, discountCents: 100 })],
    );
    expect(totals.grossCents).toBe(500);
  });
});

describe("analyseSales — lines with no cost", () => {
  it("keeps their revenue but leaves them out of the margin, and counts them", () => {
    const lines = [
      line({ productId: "a", lineTotalCents: 1100, unitCostCents: 600 }),
      line({ productId: "b", productName: "Senza costo", lineTotalCents: 1100, unitCostCents: null }),
    ];
    const { totals } = analyseSales(lines, [order({ subtotalCents: 2200 })]);

    // Both lines' revenue is present…
    expect(totals.netCents).toBe(2000);
    // …but only one line's base backs the margin.
    expect(totals.costedNetCents).toBe(1000);
    expect(totals.marginCents).toBe(400);
    expect(totals.uncostedLines).toBe(1);
    expect(totals.coverage).toBeCloseTo(0.5, 5);
    // 40% of what it describes — NOT 20%, which is what averaging the uncosted
    // line in as though it cost nothing would produce.
    expect(marginPct(totals)).toBe(40);
  });

  it("reports a null margin percentage when nothing carries a cost", () => {
    const { totals } = analyseSales([line({ unitCostCents: null })], [order()]);
    expect(marginPct(totals)).toBeNull();
    expect(totals.coverage).toBe(0);
  });
});

describe("analyseSales — grouping", () => {
  it("groups by product id, so a renamed product stays one row", () => {
    const lines = [
      line({ productId: "p1", productName: "Ciauscolo" }),
      line({ productId: "p1", productName: "Ciauscolo di Visso", orderId: "o2" }),
    ];
    const { byProduct } = analyseSales(lines, [order(), order({ id: "o2" })]);
    expect(byProduct).toHaveLength(1);
    expect(byProduct[0].lines).toBe(2);
  });

  it("keeps a deleted product's sales instead of dropping them", () => {
    const { byProduct, totals } = analyseSales(
      [line({ productId: null, productName: "Prodotto rimosso", unitCostCents: null })],
      [order()],
    );
    expect(byProduct).toHaveLength(1);
    expect(byProduct[0].label).toBe("Prodotto rimosso");
    expect(totals.grossCents).toBe(1100);
  });

  it("counts each order once, however many lines it has", () => {
    const lines = [line({ productId: "a" }), line({ productId: "b" })];
    const { totals } = analyseSales(lines, [order({ subtotalCents: 2200 })]);
    expect(totals.orders).toBe(1);
    expect(totals.lines).toBe(2);
  });

  it("ranks every table by revenue, biggest first", () => {
    const lines = [
      line({ productId: "small", productName: "Piccolo", category: "A", lineTotalCents: 100 }),
      line({ productId: "big", productName: "Grande", category: "B", lineTotalCents: 5000 }),
    ];
    const { byProduct, byCategory } = analyseSales(lines, [order({ subtotalCents: 5100 })]);
    expect(byProduct.map((p) => p.label)).toEqual(["Grande", "Piccolo"]);
    expect(byCategory.map((c) => c.label)).toEqual(["B", "A"]);
  });

  it("labels an uncategorised line rather than dropping it", () => {
    const { byCategory } = analyseSales([line({ category: "" })], [order()]);
    expect(byCategory[0].label).toBe("Senza categoria");
  });

  it("uses the caller's shop labels, and names shipping-only revenue", () => {
    const lines = [
      line({ shopSlug: "centro" }),
      line({ shopSlug: null, productId: "b", orderId: "o2" }),
    ];
    const { byShop } = analyseSales(lines, [order(), order({ id: "o2" })], {
      shopLabel: (slug) => (slug ? "Taccalite Centro" : "Spedizioni / senza sede"),
    });
    expect(byShop.map((s) => s.label).sort()).toEqual([
      "Spedizioni / senza sede",
      "Taccalite Centro",
    ]);
  });
});

describe("analyseSales — mixed VAT rates", () => {
  it("splits each line at its own snapshotted rate", () => {
    // A 22% line and a 10% line must not be split at one blended rate: the
    // order's own `vatRateBps` snapshot is per line for exactly this reason.
    const lines = [
      line({ productId: "vino", vatRateBps: 2200, lineTotalCents: 1220, unitCostCents: null }),
      line({ productId: "salume", vatRateBps: 1000, lineTotalCents: 1100, unitCostCents: null }),
    ];
    const { totals } = analyseSales(lines, [order({ subtotalCents: 2320 })]);
    const expected =
      splitGross(1220, 2200).imponibileCents + splitGross(1100, 1000).imponibileCents;
    expect(totals.netCents).toBe(expected);
    expect(totals.netCents).toBe(1000 + 1000);
  });
});

describe("analyseSales — empty", () => {
  it("returns zeroed totals rather than NaN", () => {
    const { totals, byCategory } = analyseSales([], []);
    expect(totals.grossCents).toBe(0);
    expect(totals.orders).toBe(0);
    expect(totals.coverage).toBe(0);
    expect(marginPct(totals)).toBeNull();
    expect(byCategory).toEqual([]);
  });
});
