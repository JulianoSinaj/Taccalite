import { describe, it, expect, beforeAll, vi } from "vitest";

// The action path writes a session cookie and revalidates routes, both of which
// want Next's request scope. Stub them so the guards can be exercised here.
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
import { finalizeOrder } from "@/lib/orders";
import {
  updateOrderStatus,
  bulkUpdateOrderStatus,
  updateOrderItems,
  updateOrderDetails,
  refundOrder,
  setOrderTracking,
} from "@/lib/admin/order-actions";

/**
 * The order state machine as the admin drives it: which transitions the page
 * offers are exactly the ones the actions accept, and an edit re-derives the
 * same money the order was rung up with.
 */

const SHOP = "life-shop";
const UNIT = "life-unit"; // sold by the piece, tracks stock
const KG = "life-kg"; // priced per kg
let unitId = "";
let seq = 0;

type OrderRow = typeof orders.$inferSelect;

async function makeOrder(over: Partial<OrderRow> = {}, lines: { qty: number }[] = [{ qty: 2 }]) {
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber: `LF-${Date.now()}-${++seq}`,
      email: "cliente@example.com",
      name: "Cliente",
      fulfilment: "pickup",
      shopSlug: SHOP,
      subtotalCents: 2000,
      totalCents: 2000,
      status: "pending",
      paymentStatus: "unpaid",
      paymentMethod: "in_store",
      ...over,
    })
    .returning({ id: orders.id });
  await db.insert(orderItems).values(
    lines.map((l) => ({
      orderId: row.id,
      productId: unitId,
      productSlug: UNIT,
      name: "Pezzo",
      unitPriceCents: 1000,
      quantity: l.qty,
      lineTotalCents: 1000 * l.qty,
    })),
  );
  return row.id;
}

const load = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const stockOf = async () =>
  (await db.select({ stock: products.stock }).from(products).where(eq(products.id, unitId)))[0].stock;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const setStatus = (id: string, status: string, paymentStatus?: string) =>
  updateOrderStatus(
    { status: "idle" },
    form({ id, status, ...(paymentStatus ? { paymentStatus } : {}) }),
  );

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Ciclo di vita", specialty: "Test" })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(products)
    .values([
      { slug: UNIT, name: "Pezzo", shopSlug: SHOP, priceCents: 1000, stock: 10, active: true },
      { slug: KG, name: "Salame", shopSlug: SHOP, priceCents: 2000, soldByWeight: true, unit: "kg", active: true },
    ])
    .onConflictDoNothing({ target: products.slug });
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.slug, UNIT));
  unitId = p.id;

  await db
    .insert(users)
    .values({
      username: "life-admin",
      email: "life-admin@example.com",
      name: "Admin",
      passwordHash: hashPassword("Password!234"),
      role: "admin",
    })
    .onConflictDoNothing({ target: users.username });
  const res = await loginUser({ identifier: "life-admin", password: "Password!234" });
  expect(res.ok).toBe(true);
});

describe("payment state is never moved by the status form", () => {
  it("refuses to put a settled order back to 'da pagare'", async () => {
    const id = await makeOrder({ status: "paid", paymentStatus: "paid", paidAt: new Date() });
    const res = await setStatus(id, "paid", "unpaid");
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/già stato incassato/);
    expect((await load(id)).paymentStatus).toBe("paid");
  });

  it("refuses 'in attesa' on a paid order — that state means awaiting payment", async () => {
    const id = await makeOrder({ status: "fulfilled", paymentStatus: "paid", paidAt: new Date() });
    const res = await setStatus(id, "pending");
    expect(res.status).toBe("error");
    expect((await load(id)).status).toBe("fulfilled");
  });

  it("lets a paid order go back to the to-fulfil queue instead", async () => {
    const id = await makeOrder({ status: "fulfilled", paymentStatus: "paid", paidAt: new Date() });
    expect((await setStatus(id, "paid")).status).toBe("success");
    expect((await load(id)).status).toBe("paid");
  });

  it("freezes a refunded order", async () => {
    const id = await makeOrder({ status: "refunded", paymentStatus: "refunded", refundedCents: 2000 });
    const res = await setStatus(id, "fulfilled");
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/rimborsato/);
  });
});

describe("settling", () => {
  it("keeps an order already handed over as 'evaso'", async () => {
    // Goods first, money after: the normal rhythm at the counter.
    const id = await makeOrder({ status: "fulfilled", paymentStatus: "unpaid" });
    await finalizeOrder(id, { paidWith: "cash" });
    const row = await load(id);
    expect(row.paymentStatus).toBe("paid");
    expect(row.status).toBe("fulfilled");
    expect(row.paidWith).toBe("cash");
  });

  it("still moves a pending order to 'pagato'", async () => {
    const id = await makeOrder();
    await finalizeOrder(id, { paidWith: "pos" });
    expect((await load(id)).status).toBe("paid");
  });
});

describe("cancelling and restoring", () => {
  it("re-reserves the goods when an order to be paid on handover is restored", async () => {
    await db.update(products).set({ stock: 10 }).where(eq(products.id, unitId));
    const id = await makeOrder({ paymentMethod: "in_store", stockAppliedAt: new Date() });

    expect((await setStatus(id, "cancelled")).status).toBe("success");
    expect(await stockOf()).toBe(12);
    expect((await load(id)).stockAppliedAt).toBeNull();

    expect((await setStatus(id, "pending")).status).toBe("success");
    expect(await stockOf()).toBe(10);
    expect((await load(id)).stockAppliedAt).not.toBeNull();
  });

  it("does not reserve for a restored card checkout — payment does that", async () => {
    await db.update(products).set({ stock: 10 }).where(eq(products.id, unitId));
    const id = await makeOrder({ paymentMethod: "card", status: "cancelled" });
    expect((await setStatus(id, "pending")).status).toBe("success");
    expect(await stockOf()).toBe(10);
    expect((await load(id)).stockAppliedAt).toBeNull();
  });
});

describe("shipping", () => {
  it("cannot be marked 'evasa' without a tracking number", async () => {
    const id = await makeOrder({
      fulfilment: "shipping",
      shopSlug: null,
      status: "paid",
      paymentStatus: "paid",
      paymentMethod: "card",
      shippingAddress: { address: "Via Roma 1", city: "Ancona", zip: "60121" },
    });
    const res = await setStatus(id, "fulfilled");
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/tracking/);
    expect((await load(id)).status).toBe("paid");

    await setOrderTracking({ status: "idle" }, form({ id, carrier: "BRT", trackingNumber: "123" }));
    expect((await setStatus(id, "fulfilled")).status).toBe("success");
    expect((await load(id)).status).toBe("fulfilled");
  });
});

describe("refunding", () => {
  it("is refused on an order that was never paid", async () => {
    const id = await makeOrder();
    const res = await refundOrder({ status: "idle" }, form({ id }));
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/non è stato incassato/);
    expect((await load(id)).refundedCents).toBe(0);
  });
});

describe("editing an unpaid order", () => {
  it("keeps a weighed line, a negotiated price and the counter discount through two edits", async () => {
    const id = await makeOrder();

    const res = await updateOrderItems(
      { status: "idle" },
      form({
        id,
        [`qty_${UNIT}`]: "1",
        [`kg_${KG}`]: "0.35",
        [`price_${KG}`]: "18",
        discountCode: "",
        manualDiscountEuros: "1",
        shippingEuros: "",
      }),
    );
    expect(res.status).toBe("success");

    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    const kg = lines.find((l) => l.productSlug === KG)!;
    expect(kg.weightKg).toBe(0.35);
    expect(kg.quantity).toBe(1);
    expect(kg.unitPriceCents).toBe(1800);
    expect(kg.priceOverridden).toBe(true);
    expect(kg.lineTotalCents).toBe(630);

    let row = await load(id);
    expect(row.subtotalCents).toBe(1630);
    expect(row.manualDiscountCents).toBe(100);
    expect(row.discountCents).toBe(100);
    expect(row.totalCents).toBe(1530);

    // An unrelated edit — the phone number — must not re-price the order.
    const details = await updateOrderDetails(
      { status: "idle" },
      form({ id, name: "Cliente", email: "cliente@example.com", phone: "333", fulfilment: "pickup", shopSlug: SHOP }),
    );
    expect(details.status).toBe("success");
    row = await load(id);
    expect(row.phone).toBe("333");
    expect(row.totalCents).toBe(1530);
    expect(row.discountCents).toBe(100);
  });

  it("caps the counter discount at the goods when the basket shrinks", async () => {
    const id = await makeOrder();
    await updateOrderItems(
      { status: "idle" },
      form({ id, [`qty_${UNIT}`]: "3", discountCode: "", manualDiscountEuros: "25", shippingEuros: "" }),
    );
    expect((await load(id)).totalCents).toBe(500); // 30 − 25
    await updateOrderItems(
      { status: "idle" },
      form({ id, [`qty_${UNIT}`]: "1", discountCode: "", manualDiscountEuros: "25", shippingEuros: "" }),
    );
    const row = await load(id);
    expect(row.discountCents).toBe(1000);
    expect(row.totalCents).toBe(0);
  });
});

describe("bulk reopen", () => {
  it("sends a paid order to 'da evadere' and an unpaid one to 'in attesa'", async () => {
    const paid = await makeOrder({ status: "fulfilled", paymentStatus: "paid", paidAt: new Date() });
    const unpaid = await makeOrder({ status: "fulfilled" });
    const fd = new FormData();
    fd.append("ids", paid);
    fd.append("ids", unpaid);
    fd.set("status", "reopen");
    const res = await bulkUpdateOrderStatus({ status: "idle" }, fd);
    expect(res.status).toBe("success");
    expect((await load(paid)).status).toBe("paid");
    expect((await load(unpaid)).status).toBe("pending");
  });
});
