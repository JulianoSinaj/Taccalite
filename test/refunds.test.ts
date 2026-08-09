import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, orders, orderItems, discountCodes } from "@/lib/db/schema";
import { recordRefund, expireOrder } from "@/lib/orders";

/**
 * Refund bookkeeping and abandoned-order cleanup.
 *
 * These cover the money-shaped invariants that a UI test can't: that a partial
 * refund does NOT put goods back or free a coupon, that the full-refund
 * transition does both exactly once, and that replaying the same cumulative
 * amount (a redelivered Stripe webhook) is a no-op.
 */

const SHOP = "refund-shop";
const PRODUCT = "refund-prod";

let seq = 0;
const nextNumber = () => `RF-${Date.now()}-${++seq}`;

/** A paid order for `qty` units, optionally carrying an already-counted coupon. */
async function makePaidOrder(opts: { qty: number; unitCents: number; discountCode?: string }) {
  const total = opts.qty * opts.unitCents;
  const [productRow] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, PRODUCT))
    .limit(1);

  const [row] = await db
    .insert(orders)
    .values({
      orderNumber: nextNumber(),
      email: "cliente@example.com",
      name: "Cliente Rimborso",
      fulfilment: "pickup",
      shopSlug: SHOP,
      subtotalCents: total,
      totalCents: total,
      status: "paid",
      paymentStatus: "paid",
      paidAt: new Date(),
      discountCode: opts.discountCode ?? null,
    })
    .returning({ id: orders.id });

  await db.insert(orderItems).values({
    orderId: row.id,
    productId: productRow.id,
    name: "Prodotto rimborso",
    unitPriceCents: opts.unitCents,
    quantity: opts.qty,
    lineTotalCents: total,
  });
  return row.id;
}

const readOrder = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];
const readStock = async () =>
  (await db.select({ stock: products.stock }).from(products).where(eq(products.slug, PRODUCT)).limit(1))[0].stock;
const setStock = async (n: number) => db.update(products).set({ stock: n }).where(eq(products.slug, PRODUCT));

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Rimborsi", specialty: "Test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(products)
    .values({
      slug: PRODUCT,
      name: "Prodotto rimborso",
      shopSlug: SHOP,
      priceCents: 1000,
      purchasable: true,
      stock: 100,
    })
    .onConflictDoNothing({ target: products.slug });
});

describe("recordRefund — partial refunds", () => {
  it("accumulates without settling the order", async () => {
    const id = await makePaidOrder({ qty: 2, unitCents: 1000 }); // 20,00 €
    await setStock(50);

    const first = await recordRefund(id, 500, { reason: "Parziale" });
    expect(first).toMatchObject({ deltaCents: 500, refundedCents: 500, full: false });

    const second = await recordRefund(id, 1200, { reason: "Parziale" });
    expect(second).toMatchObject({ deltaCents: 700, refundedCents: 1200, full: false });

    const order = await readOrder(id);
    expect(order.refundedCents).toBe(1200);
    // Still a live, paid order — only part of the money went back.
    expect(order.status).toBe("paid");
    expect(order.paymentStatus).toBe("paid");
  });

  it("does not return goods to stock", async () => {
    const id = await makePaidOrder({ qty: 3, unitCents: 1000 });
    await setStock(40);

    await recordRefund(id, 1500, { reason: "Parziale" });

    // A price adjustment is not a return: the customer kept the salumi.
    expect(await readStock()).toBe(40);
  });

  it("does not free the coupon", async () => {
    await db
      .insert(discountCodes)
      .values({ code: "RIMB10", type: "percent", value: 10, timesUsed: 5, active: true })
      .onConflictDoUpdate({ target: discountCodes.code, set: { timesUsed: 5 } });
    const id = await makePaidOrder({ qty: 2, unitCents: 1000, discountCode: "RIMB10" });

    await recordRefund(id, 400, { reason: "Parziale" });

    const [code] = await db.select().from(discountCodes).where(eq(discountCodes.code, "RIMB10")).limit(1);
    expect(code.timesUsed).toBe(5);
  });
});

describe("recordRefund — full refunds", () => {
  it("settles the order, restocks and frees the coupon exactly once", async () => {
    await db
      .insert(discountCodes)
      .values({ code: "RIMB20", type: "percent", value: 20, timesUsed: 3, active: true })
      .onConflictDoUpdate({ target: discountCodes.code, set: { timesUsed: 3 } });
    const id = await makePaidOrder({ qty: 4, unitCents: 1000, discountCode: "RIMB20" }); // 40,00 €
    await setStock(30);

    const partial = await recordRefund(id, 1000, { reason: "Parziale" });
    expect(partial?.full).toBe(false);
    expect(await readStock()).toBe(30);

    const full = await recordRefund(id, 4000, { reason: "Totale" });
    expect(full).toMatchObject({ deltaCents: 3000, refundedCents: 4000, full: true });

    const order = await readOrder(id);
    expect(order.status).toBe("refunded");
    expect(order.paymentStatus).toBe("refunded");
    // All four units come back on the transition to full — not four plus the
    // ones a partial refund might have double-counted.
    expect(await readStock()).toBe(34);

    const [code] = await db.select().from(discountCodes).where(eq(discountCodes.code, "RIMB20")).limit(1);
    expect(code.timesUsed).toBe(2);
  });

  it("is idempotent when the same cumulative amount is replayed", async () => {
    const id = await makePaidOrder({ qty: 2, unitCents: 1000 });
    await setStock(20);

    const first = await recordRefund(id, 2000, { reason: "Totale" });
    expect(first?.deltaCents).toBe(2000);
    expect(await readStock()).toBe(22);

    // A redelivered `charge.refunded` webhook reports the same cumulative total.
    const replay = await recordRefund(id, 2000, { reason: "Totale" });
    expect(replay).toMatchObject({ deltaCents: 0, full: true });
    // Critically: no second restock.
    expect(await readStock()).toBe(22);
  });

  it("caps a refund at the order total and ignores a lower amount", async () => {
    const id = await makePaidOrder({ qty: 1, unitCents: 1000 });
    await setStock(10);

    await recordRefund(id, 1500, { reason: "Oltre il totale" });
    const order = await readOrder(id);
    expect(order.refundedCents).toBe(1000);
    expect(order.paymentStatus).toBe("refunded");

    // Going backwards (a stale event) must not un-refund anything.
    const back = await recordRefund(id, 200, { reason: "Stale" });
    expect(back?.deltaCents).toBe(0);
    expect((await readOrder(id)).refundedCents).toBe(1000);
  });

  it("returns null for an unknown order", async () => {
    expect(await recordRefund("does-not-exist", 100, { reason: "x" })).toBeNull();
  });
});

describe("expireOrder", () => {
  it("cancels an abandoned unpaid order", async () => {
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: nextNumber(),
        email: "abbandonato@example.com",
        name: "Carrello Abbandonato",
        fulfilment: "pickup",
        shopSlug: SHOP,
        subtotalCents: 1000,
        totalCents: 1000,
      })
      .returning({ id: orders.id });

    expect(await expireOrder(row.id)).toBe(true);
    expect((await readOrder(row.id)).status).toBe("cancelled");
  });

  it("never touches an order that was paid", async () => {
    const id = await makePaidOrder({ qty: 1, unitCents: 1000 });

    // A late `session.expired` after the payment webhook must not cancel a sale.
    expect(await expireOrder(id)).toBe(false);
    const order = await readOrder(id);
    expect(order.status).toBe("paid");
    expect(order.paymentStatus).toBe("paid");
  });
});
