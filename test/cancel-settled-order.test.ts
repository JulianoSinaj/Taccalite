import { describe, it, expect, beforeAll, vi } from "vitest";

// The action path writes a session cookie and revalidates routes, both of which
// want Next's request scope. Stub them so the guard can be exercised here.
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

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, orders, orderItems, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginUser } from "@/lib/auth/service";
import { updateOrderStatus } from "@/lib/admin/order-actions";

/**
 * Cancelling a settled order used to move the goods without moving the money.
 *
 * The restock ran, the coupon was released and the customer was emailed a
 * cancellation — while `paymentStatus` stayed "paid", so the sale kept counting
 * in the takings, in the 30-day KPI and in the IVA a debito of a period that may
 * already have been declared. The meat came back and the money did not.
 */

const SHOP = "cancel-shop";
const PRODUCT = "cancel-prod";
let productId = "";
let seq = 0;

async function makeOrder(paid: boolean) {
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber: `CN-${Date.now()}-${++seq}`,
      email: "cliente@example.com",
      name: "Cliente",
      fulfilment: "pickup",
      shopSlug: SHOP,
      subtotalCents: 1000,
      totalCents: 1000,
      status: paid ? "paid" : "pending",
      paymentStatus: paid ? "paid" : "unpaid",
      paidAt: paid ? new Date() : null,
      // Both states hold a stock claim: a card order takes it at payment, an
      // order to be paid on collection takes it when it is placed.
      stockAppliedAt: new Date(),
    })
    .returning({ id: orders.id });
  await db.insert(orderItems).values({
    orderId: row.id,
    productId,
    name: "Prodotto",
    unitPriceCents: 1000,
    quantity: 2,
    lineTotalCents: 2000,
  });
  return row.id;
}

const cancel = (id: string) => {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("status", "cancelled");
  return updateOrderStatus({ status: "idle" }, fd);
};

const stockOf = async () =>
  (await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId)))[0]
    .stock;

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Annulli", specialty: "Test" })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(products)
    .values({ slug: PRODUCT, name: "Prodotto", shopSlug: SHOP, priceCents: 1000, stock: 10 })
    .onConflictDoNothing({ target: products.slug });
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.slug, PRODUCT));
  productId = p.id;

  await db
    .insert(users)
    .values({
      username: "cancel-admin",
      email: "cancel-admin@example.com",
      name: "Admin",
      passwordHash: hashPassword("Password!234"),
      role: "admin",
    })
    .onConflictDoNothing({ target: users.username });
  const res = await loginUser({ identifier: "cancel-admin", password: "Password!234" });
  expect(res.ok).toBe(true);
});

describe("cancelling an order", () => {
  it("is allowed while nobody has paid, and returns the goods", async () => {
    await db.update(products).set({ stock: 10 }).where(eq(products.id, productId));
    const id = await makeOrder(false);

    const res = await cancel(id);
    expect(res.status).toBe("success");

    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    expect(row.status).toBe("cancelled");
    // The two units it was holding are back on the shelf.
    expect(await stockOf()).toBe(12);
  });

  it("is refused once the money is in", async () => {
    await db.update(products).set({ stock: 10 }).where(eq(products.id, productId));
    const id = await makeOrder(true);

    const res = await cancel(id);
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/Rimborsa/);
  });

  it("leaves the order and the stock exactly as they were when it refuses", async () => {
    await db.update(products).set({ stock: 10 }).where(eq(products.id, productId));
    const id = await makeOrder(true);

    await cancel(id);

    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    // The state that used to diverge: goods back, money still on the books.
    expect(row.status).toBe("paid");
    expect(row.paymentStatus).toBe("paid");
    expect(row.refundedCents).toBe(0);
    expect(row.stockAppliedAt).not.toBeNull();
    expect(await stockOf()).toBe(10);
  });

  it("refuses a refunded order too", async () => {
    const id = await makeOrder(true);
    await db
      .update(orders)
      .set({ paymentStatus: "refunded", status: "refunded", refundedCents: 1000 })
      .where(eq(orders.id, id));

    const res = await cancel(id);
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/già stato rimborsato/i);
  });
});
