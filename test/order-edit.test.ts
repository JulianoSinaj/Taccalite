import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, orders, orderItems, settings, discountCodes } from "@/lib/db/schema";
import { recalcOrderTotals } from "@/lib/orders";

const SHOP = "recalc-shop";

async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Insert a bare order plus its lines, returning the order id. */
async function makeOrder(opts: {
  fulfilment: "pickup" | "shipping";
  discountCode?: string;
  lines: { name: string; unit: number; qty: number }[];
}) {
  const subtotal = opts.lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber: `RC-${Math.floor(performance.now() * 1000)}-${opts.lines.length}`,
      email: "cliente@example.com",
      name: "Cliente",
      fulfilment: opts.fulfilment,
      shopSlug: opts.fulfilment === "pickup" ? SHOP : null,
      subtotalCents: subtotal,
      totalCents: subtotal,
      discountCode: opts.discountCode ?? null,
    })
    .returning({ id: orders.id });
  await db.insert(orderItems).values(
    opts.lines.map((l) => ({
      orderId: row.id,
      name: l.name,
      unitPriceCents: l.unit,
      quantity: l.qty,
      lineTotalCents: l.unit * l.qty,
    })),
  );
  return row.id;
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Ricalcolo", specialty: "Test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(products)
    .values({ slug: "rc-prod", name: "Prodotto", shopSlug: SHOP, priceCents: 1000, purchasable: true })
    .onConflictDoNothing({ target: products.slug });
});

beforeEach(async () => {
  await setSetting("store.shippingCents", 700);
  await setSetting("store.freeShippingThresholdCents", 0);
  await db.delete(discountCodes).where(eq(discountCodes.code, "RC10"));
  await db.delete(discountCodes).where(eq(discountCodes.code, "RCMIN"));
});

describe("recalcOrderTotals", () => {
  it("re-derives the subtotal from the current lines", async () => {
    const id = await makeOrder({ fulfilment: "pickup", lines: [{ name: "A", unit: 500, qty: 3 }] });
    const r = await recalcOrderTotals(id);
    expect(r.subtotalCents).toBe(1500);
    expect(r.shippingCents).toBe(0); // pickup never pays shipping
    expect(r.totalCents).toBe(1500);

    const [saved] = await db.select().from(orders).where(eq(orders.id, id));
    expect(saved.totalCents).toBe(1500);
  });

  it("charges shipping on a shipping order and waives it past the free threshold", async () => {
    const id = await makeOrder({ fulfilment: "shipping", lines: [{ name: "A", unit: 1000, qty: 1 }] });
    expect((await recalcOrderTotals(id)).totalCents).toBe(1700);

    await setSetting("store.freeShippingThresholdCents", 1000);
    const free = await recalcOrderTotals(id);
    expect(free.shippingCents).toBe(0);
    expect(free.totalCents).toBe(1000);
  });

  it("re-applies a still-valid coupon against the new subtotal", async () => {
    await db.insert(discountCodes).values({ code: "RC10", type: "percent", value: 10, active: true });
    const id = await makeOrder({
      fulfilment: "pickup",
      discountCode: "RC10",
      lines: [{ name: "A", unit: 1000, qty: 2 }],
    });

    const r = await recalcOrderTotals(id);
    expect(r.subtotalCents).toBe(2000);
    expect(r.discountCents).toBe(200);
    expect(r.totalCents).toBe(1800);
    expect(r.droppedDiscountCode).toBeUndefined();
  });

  it("drops a coupon that the edited subtotal no longer qualifies for", async () => {
    await db
      .insert(discountCodes)
      .values({ code: "RCMIN", type: "fixed", value: 500, minSubtotalCents: 5000, active: true });
    const id = await makeOrder({
      fulfilment: "pickup",
      discountCode: "RCMIN",
      // 20,00 € — below the code's 50,00 € minimum.
      lines: [{ name: "A", unit: 1000, qty: 2 }],
    });

    const r = await recalcOrderTotals(id);
    expect(r.droppedDiscountCode).toBe("RCMIN");
    expect(r.discountCents).toBe(0);
    expect(r.totalCents).toBe(2000);

    const [saved] = await db.select().from(orders).where(eq(orders.id, id));
    expect(saved.discountCode).toBeNull();
  });

  it("never lets a discount push the total below zero", async () => {
    await db
      .insert(discountCodes)
      .values({ code: "RC10", type: "fixed", value: 99999, active: true });
    const id = await makeOrder({
      fulfilment: "pickup",
      discountCode: "RC10",
      lines: [{ name: "A", unit: 1000, qty: 1 }],
    });
    expect((await recalcOrderTotals(id)).totalCents).toBe(0);
  });
});
