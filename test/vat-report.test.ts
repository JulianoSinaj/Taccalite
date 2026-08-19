import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, orders, orderItems, settings } from "@/lib/db/schema";
import { getVatReport } from "@/lib/admin/queries";
import { totalImposta } from "@/lib/fiscal";

/**
 * The IVA report's period behaviour — the part that decides what gets filed.
 *
 * Two rules are load-bearing and neither is visible from a unit test of the
 * allocation maths:
 *
 *  1. A refund NEVER retroactively shrinks the period the sale was declared in.
 *     January's return was filed on January's sales; a March refund is March's
 *     credit note.
 *  2. A partial refund IS deducted — in its own period. Before this the sale
 *     side counted the full gross forever and the money handed back was never
 *     declared anywhere, which over-stated VAT.
 */

const SHOP = "vat-shop";
const PRODUCT = "vat-prod";

// Fixed, far-apart months so these rows can't collide with another test file's.
const JAN = new Date("2031-01-15T10:00:00Z");
const MAR = new Date("2031-03-15T10:00:00Z");
const monthRange = (month: number) => ({
  from: new Date(Date.UTC(2031, month - 1, 1)),
  to: new Date(Date.UTC(2031, month, 1)), // exclusive
});

let seq = 0;

/** A paid order of one line at 22%, optionally already refunded. */
async function makeOrder(opts: {
  grossCents: number;
  paidAt: Date;
  refundedCents?: number;
  refundedAt?: Date;
}) {
  const [productRow] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, PRODUCT))
    .limit(1);

  const full = (opts.refundedCents ?? 0) >= opts.grossCents;
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber: `VAT-${Date.now()}-${++seq}`,
      email: "iva@example.com",
      name: "Cliente IVA",
      fulfilment: "pickup",
      shopSlug: SHOP,
      subtotalCents: opts.grossCents,
      totalCents: opts.grossCents,
      status: full ? "refunded" : "paid",
      paymentStatus: full ? "refunded" : "paid",
      paidAt: opts.paidAt,
      createdAt: opts.paidAt,
      refundedCents: opts.refundedCents ?? 0,
      refundedAt: opts.refundedAt ?? null,
    })
    .returning({ id: orders.id });

  await db.insert(orderItems).values({
    orderId: row.id,
    productId: productRow.id,
    name: "Prodotto IVA",
    unitPriceCents: opts.grossCents,
    quantity: 1,
    lineTotalCents: opts.grossCents,
    vatRateBps: 2200,
  });
  return row.id;
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Sede IVA", specialty: "test" })
    .onConflictDoNothing();
  await db
    .insert(products)
    .values({ slug: PRODUCT, name: "Prodotto IVA", shopSlug: SHOP, priceCents: 1220, vatRateBps: 2200 })
    .onConflictDoNothing();
  await db
    .insert(settings)
    .values({ key: "store.shippingVatRate", value: 22 })
    .onConflictDoNothing();
});

describe("getVatReport — periods", () => {
  it("declares a sale in the period it was paid", async () => {
    await makeOrder({ grossCents: 1220, paidAt: JAN });
    const { from, to } = monthRange(1);
    const r = await getVatReport(from, to);
    expect(r.salesCount).toBeGreaterThan(0);
    expect(totalImposta(r.sales)).toBeGreaterThan(0);
  });

  it("keeps a later-refunded sale in its original period, undiminished", async () => {
    const jan = monthRange(1);
    const before = await getVatReport(jan.from, jan.to);

    // A January sale, fully refunded in March.
    await makeOrder({ grossCents: 1220, paidAt: JAN, refundedCents: 1220, refundedAt: MAR });

    const after = await getVatReport(jan.from, jan.to);
    // January grew by the sale and is NOT reduced by the March refund.
    expect(after.sales.length).toBeGreaterThan(0);
    expect(totalImposta(after.sales)).toBe(totalImposta(before.sales) + 220);
    expect(totalImposta(after.buckets)).toBe(totalImposta(before.buckets) + 220);
    // No credit note lands in January.
    expect(totalImposta(after.reversals)).toBe(totalImposta(before.reversals));
  });

  it("books the refund as a credit note in the period it happened", async () => {
    const mar = monthRange(3);
    const before = await getVatReport(mar.from, mar.to);

    await makeOrder({ grossCents: 2440, paidAt: JAN, refundedCents: 2440, refundedAt: MAR });

    const after = await getVatReport(mar.from, mar.to);
    // March gains a negative 440 of tax and no sale.
    expect(totalImposta(after.reversals)).toBe(totalImposta(before.reversals) - 440);
    expect(totalImposta(after.sales)).toBe(totalImposta(before.sales));
    expect(totalImposta(after.buckets)).toBe(totalImposta(before.buckets) - 440);
    expect(after.reversalCount).toBe(before.reversalCount + 1);
  });

  it("deducts a partial refund — the over-declaration this fixes", async () => {
    const mar = monthRange(3);
    const before = await getVatReport(mar.from, mar.to);

    // Paid AND partially refunded inside March: the period nets to the kept part.
    await makeOrder({
      grossCents: 1220,
      paidAt: MAR,
      refundedCents: 610,
      refundedAt: MAR,
    });

    const after = await getVatReport(mar.from, mar.to);
    // Sale +220, reversal −110, net +110 — VAT on the €6.10 actually kept.
    expect(totalImposta(after.sales)).toBe(totalImposta(before.sales) + 220);
    expect(totalImposta(after.reversals)).toBe(totalImposta(before.reversals) - 110);
    expect(totalImposta(after.buckets)).toBe(totalImposta(before.buckets) + 110);
  });

  it("excludes an unpaid order from both sides", async () => {
    const apr = monthRange(4);
    const before = await getVatReport(apr.from, apr.to);

    await db.insert(orders).values({
      orderNumber: `VAT-UNPAID-${Date.now()}`,
      email: "iva@example.com",
      name: "Bozza",
      fulfilment: "pickup",
      shopSlug: SHOP,
      subtotalCents: 5000,
      totalCents: 5000,
      status: "pending",
      paymentStatus: "unpaid",
      createdAt: new Date(Date.UTC(2031, 3, 10)),
    });

    const after = await getVatReport(apr.from, apr.to);
    expect(after.salesCount).toBe(before.salesCount);
    expect(totalImposta(after.buckets)).toBe(totalImposta(before.buckets));
  });

  it("includes an order settled in the final second of the period", async () => {
    // 23:59:59.500 on the last day — the old inclusive `T23:59:59` bound dropped it.
    const lastMoment = new Date(Date.UTC(2031, 4, 31, 23, 59, 59, 500));
    const may = monthRange(5);
    const before = await getVatReport(may.from, may.to);

    await makeOrder({ grossCents: 1220, paidAt: lastMoment });

    const after = await getVatReport(may.from, may.to);
    expect(after.salesCount).toBe(before.salesCount + 1);
  });
});
