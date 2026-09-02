import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderItems, orders, productBatches, products, shops, stockMovements } from "@/lib/db/schema";
import { createOrder, finalizeOrder } from "@/lib/orders";
import { getOrdersForLot, getLotsForOrder } from "@/lib/admin/queries";
import type { CheckoutInput } from "@/lib/validation/order";

/**
 * The question a food recall actually asks.
 *
 * `consumeBatchesFefo` has always computed which lots a sale drew on, and both
 * callers threw the answer away — so the platform could say *when* a lot was
 * consumed and never *who received it*, which is the only reason
 * `product_batches` exists. A recall meant reading paper delivery notes and
 * guessing.
 */

const SHOP = "lot-shop";
const SLUG = "lot-prod";
const EMAIL = "lot-customer@example.com";

const basket = (qty: number): CheckoutInput =>
  ({
    items: [{ slug: SLUG, quantity: qty }],
    name: "Cliente Tracciato",
    email: EMAIL,
    phone: "0711234567",
    fulfilment: "pickup",
    paymentMethod: "in_store",
    shopSlug: SHOP,
  }) as CheckoutInput;

let productId = "";

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Sede lotti", specialty: "test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  const old = await db.select({ id: orders.id }).from(orders).where(eq(orders.email, EMAIL));
  if (old.length) {
    await db.delete(orderItems).where(inArray(orderItems.orderId, old.map((o) => o.id)));
    await db.delete(orders).where(inArray(orders.id, old.map((o) => o.id)));
  }
  const existing = await db.select({ id: products.id }).from(products).where(eq(products.slug, SLUG));
  for (const p of existing) {
    await db.delete(stockMovements).where(eq(stockMovements.productId, p.id));
    await db.delete(productBatches).where(eq(productBatches.productId, p.id));
  }
  await db.delete(products).where(eq(products.slug, SLUG));

  const [p] = await db
    .insert(products)
    .values({
      slug: SLUG,
      name: "Ciauscolo",
      shopSlug: SHOP,
      priceCents: 500,
      stock: 10,
      purchasable: true,
      active: true,
    })
    .returning({ id: products.id });
  productId = p!.id;

  // Two lots: the earlier expiry is the one FEFO should reach for first.
  await db.insert(productBatches).values([
    { productId, lotCode: "LOTTO-A", expiryDate: "2099-01-31", quantity: 4, remaining: 4 },
    { productId, lotCode: "LOTTO-B", expiryDate: "2099-06-30", quantity: 6, remaining: 6 },
  ]);
});

/** Place and settle an order, which is what moves the stock. */
async function buy(qty: number) {
  const created = await createOrder(basket(qty));
  await finalizeOrder(created.orderId, { paidWith: "cash" });
  return created;
}

describe("a movement records the lots it drew on", () => {
  it("attaches them to the ledger row, earliest expiry first", async () => {
    await buy(5);

    const [movement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));

    expect(movement!.lots).toEqual([
      { lotCode: "LOTTO-A", expiryDate: "2099-01-31", taken: 4 },
      { lotCode: "LOTTO-B", expiryDate: "2099-06-30", taken: 1 },
    ]);
  });

  it("links the movement to the order that caused it", async () => {
    const created = await buy(2);
    const [movement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));

    expect(movement!.orderId).toBe(created.orderId);
  });
});

describe("getOrdersForLot", () => {
  it("names the customers who received a lot, with a way to reach them", async () => {
    const created = await buy(5); // drains LOTTO-A, touches LOTTO-B

    const affected = await getOrdersForLot("LOTTO-A");
    expect(affected).toHaveLength(1);
    expect(affected[0]!.orderNumber).toBe(created.orderNumber);
    expect(affected[0]!.customerName).toBe("Cliente Tracciato");
    expect(affected[0]!.email).toBe(EMAIL);
    expect(affected[0]!.phone).toBe("0711234567");
    expect(affected[0]!.productName).toBe("Ciauscolo");
  });

  it("returns nothing for a lot that never went out", async () => {
    await buy(2); // only LOTTO-A is touched
    expect(await getOrdersForLot("LOTTO-B")).toHaveLength(0);
  });

  it("does not match a lot code that merely looks similar", async () => {
    await buy(2);
    expect(await getOrdersForLot("LOTTO")).toHaveLength(0);
    expect(await getOrdersForLot("LOTTO-A-2")).toHaveLength(0);
  });

  it("ignores an empty search rather than returning the world", async () => {
    await buy(2);
    expect(await getOrdersForLot("   ")).toHaveLength(0);
  });
});

describe("getLotsForOrder", () => {
  it("shows an order the lots it was filled from", async () => {
    const created = await buy(5);

    const lots = await getLotsForOrder(created.orderId);
    expect(lots).toHaveLength(1);
    expect(lots[0]!.productName).toBe("Ciauscolo");
    expect(lots[0]!.lots!.map((l) => l.lotCode)).toEqual(["LOTTO-A", "LOTTO-B"]);
  });

  it("is empty for an order whose products track no lots", async () => {
    await db.delete(productBatches).where(eq(productBatches.productId, productId));
    const created = await buy(2);
    expect(await getLotsForOrder(created.orderId)).toHaveLength(0);
  });
});
