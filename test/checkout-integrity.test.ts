import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => {
  const jar = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined),
      set: (k: string, v: string) => void jar.set(k, v),
      delete: (k: string) => void jar.delete(k),
    }),
    headers: async () => new Headers(),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderItems, orders, products, shops, stockMovements } from "@/lib/db/schema";
import { createOrder, finalizeOrder, recordRefund, MAX_LINE_QUANTITY } from "@/lib/orders";
import type { CheckoutInput } from "@/lib/validation/order";

/**
 * What a basket is allowed to become, and what a paid order is allowed to
 * become afterwards.
 *
 * `order-lifecycle.test.ts` and friends cover the state machine. This covers the
 * two ways the money and the goods could be made to disagree from outside: a
 * request shaped so the oversell guard never sees the real quantity, and a
 * settlement replayed onto an order that has already been given back.
 */

const SHOP = "checkout-shop";
const SLUG = "checkout-prod";

const base = (items: CheckoutInput["items"]): CheckoutInput =>
  ({
    items,
    name: "Cliente Prova",
    email: "cliente@example.com",
    fulfilment: "pickup",
    paymentMethod: "in_store",
    shopSlug: SHOP,
  }) as CheckoutInput;

const productRow = () =>
  db.select().from(products).where(eq(products.slug, SLUG)).limit(1).then((r) => r[0]);

const orderRow = (id: string) =>
  db.select().from(orders).where(eq(orders.id, id)).limit(1).then((r) => r[0]);

async function setStock(stock: number) {
  await db.update(products).set({ stock }).where(eq(products.slug, SLUG));
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Sede checkout", specialty: "test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  const old = await db.select({ id: orders.id }).from(orders).where(eq(orders.email, "cliente@example.com"));
  if (old.length > 0) {
    await db.delete(orderItems).where(inArray(orderItems.orderId, old.map((o) => o.id)));
    await db.delete(orders).where(inArray(orders.id, old.map((o) => o.id)));
  }
  const existing = await db.select({ id: products.id }).from(products).where(eq(products.slug, SLUG));
  for (const p of existing) await db.delete(stockMovements).where(eq(stockMovements.productId, p.id));
  await db.delete(products).where(eq(products.slug, SLUG));
  await db.insert(products).values({
    slug: SLUG,
    name: "Ciauscolo",
    shopSlug: SHOP,
    priceCents: 500,
    stock: 30,
    purchasable: true,
    active: true,
  });
});

describe("createOrder — basket aggregation", () => {
  it("sums a product listed more than once into one line", async () => {
    const created = await createOrder(base([
      { slug: SLUG, quantity: 2 },
      { slug: SLUG, quantity: 3 },
    ]));

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, created.orderId));
    // One line, not two: the same product twice on a packing slip and an
    // invoice is its own defect.
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(5);
    expect(items[0]!.lineTotalCents).toBe(2500);
    expect((await orderRow(created.orderId))!.subtotalCents).toBe(2500);
  });

  it("refuses a basket that only oversells once its duplicates are added up", async () => {
    // The hole this exists for: the guard compared each line against on-hand
    // separately, so 25 + 25 against a stock of 30 was 25 <= 30 twice and fifty
    // units went out of the door. The decrement floors at zero, so the shop
    // simply ran out — having taken money for meat already promised elsewhere.
    await expect(
      createOrder(base([
        { slug: SLUG, quantity: 25 },
        { slug: SLUG, quantity: 25 },
      ])),
    ).rejects.toThrow(/Scorte insufficienti|massimo/);

    // And nothing was written.
    const rows = await db.select().from(orders).where(eq(orders.email, "cliente@example.com"));
    expect(rows).toHaveLength(0);
  });

  it("applies the per-product ceiling to the summed quantity", async () => {
    await setStock(500);
    await expect(
      createOrder(base([
        { slug: SLUG, quantity: MAX_LINE_QUANTITY },
        { slug: SLUG, quantity: 1 },
      ])),
    ).rejects.toThrow(new RegExp(`${MAX_LINE_QUANTITY}`));
  });

  it("still refuses a basket whose only product has gone", async () => {
    await db.update(products).set({ purchasable: false }).where(eq(products.slug, SLUG));
    await expect(createOrder(base([{ slug: SLUG, quantity: 1 }]))).rejects.toThrow(/Nessun prodotto valido/);
  });

  it("names the missing product when part of the basket has gone", async () => {
    await db.insert(products).values({
      slug: "checkout-prod-2",
      name: "Altro",
      shopSlug: SHOP,
      priceCents: 300,
      purchasable: true,
      active: true,
    });
    await expect(
      createOrder(base([
        { slug: SLUG, quantity: 1 },
        { slug: "sparito", quantity: 1 },
      ])),
    ).rejects.toThrow(/non è più disponibile/);
    await db.delete(products).where(eq(products.slug, "checkout-prod-2"));
  });

  it("takes the goods out of stock once, for the summed quantity", async () => {
    const created = await createOrder(base([
      { slug: SLUG, quantity: 4 },
      { slug: SLUG, quantity: 6 },
    ]));
    // `in_store` reserves at placement, so the decrement has already run.
    await finalizeOrder(created.orderId, { paidWith: "cash" });
    expect((await productRow())!.stock).toBe(20);
  });
});

describe("finalizeOrder — settlement is not replayable", () => {
  it("does not re-finalize an order that has been refunded", async () => {
    // Stripe retries a failed webhook delivery for days, so a redelivered
    // `checkout.session.completed` can land after the money has gone back. The
    // claim used to be "anything except paid", and `refunded` is not `paid` —
    // so the order flipped back to paid, the coupon was counted twice, the
    // loyalty points were awarded again, and `paidAt` was re-stamped, moving the
    // sale into a different VAT period on the way past.
    const created = await createOrder(base([{ slug: SLUG, quantity: 2 }]));
    await finalizeOrder(created.orderId, { paidWith: "cash" });
    const paidAt = (await orderRow(created.orderId))!.paidAt;

    const refund = await recordRefund(created.orderId, created.totalCents, { reason: "Test" });
    expect(refund?.full).toBe(true);
    expect((await orderRow(created.orderId))!.paymentStatus).toBe("refunded");

    await finalizeOrder(created.orderId, { paidWith: "cash" });

    const after = (await orderRow(created.orderId))!;
    expect(after.paymentStatus).toBe("refunded");
    expect(after.status).toBe("refunded");
    expect(after.paidAt?.getTime()).toBe(paidAt?.getTime());
  });

  it("is still idempotent on an ordinary double settlement", async () => {
    const created = await createOrder(base([{ slug: SLUG, quantity: 2 }]));
    await finalizeOrder(created.orderId, { paidWith: "cash" });
    const first = (await orderRow(created.orderId))!;

    await finalizeOrder(created.orderId, { paidWith: "cash" });

    const second = (await orderRow(created.orderId))!;
    expect(second.paidAt?.getTime()).toBe(first.paidAt?.getTime());
    // The goods left once, not twice.
    expect((await productRow())!.stock).toBe(28);
  });
});
