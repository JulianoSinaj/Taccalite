import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deliveryZones, pickupSlots, orders, orderItems, shops, products } from "@/lib/db/schema";
import { createOrder } from "@/lib/orders";
import { pickupSlotOptions } from "@/lib/pickup-slots";
import type { CheckoutInput } from "@/lib/validation/order";
import { getPickupSlotCounts, getDeliveryZones, getPickupSlots } from "@/lib/db/queries";
import { getFulfilmentDay } from "@/lib/admin/queries";
import { instantInRome } from "@/lib/time";

const SHOP = "ff-test-shop";
const ZONE = "ff-test-zone";
const ORDER = "ff-test-order";

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Fulfilment", specialty: "test" })
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  await db.delete(orders).where(inArray(orders.id, [ORDER, `${ORDER}-2`, `${ORDER}-3`, `${ORDER}-4`]));
  await db.delete(pickupSlots).where(eq(pickupSlots.shopSlug, SHOP));
  await db.delete(deliveryZones).where(eq(deliveryZones.id, ZONE));
});

async function makeZone(over: Partial<typeof deliveryZones.$inferInsert> = {}) {
  await db.insert(deliveryZones).values({
    id: ZONE,
    name: "Zona di prova",
    mode: "delivery",
    postcodes: ["60121"],
    feeCents: 300,
    ...over,
  });
}

async function makeOrder(id: string, over: Partial<typeof orders.$inferInsert> = {}) {
  await db.insert(orders).values({
    id,
    orderNumber: `FF-${id}`,
    email: "x@y.it",
    name: "Prova",
    shopSlug: SHOP,
    ...over,
  });
}

describe("orders.fulfilment", () => {
  it("accepts the third mode the enum was widened for", async () => {
    await makeOrder(ORDER, { fulfilment: "delivery" });
    const [row] = await db.select().from(orders).where(eq(orders.id, ORDER));
    expect(row.fulfilment).toBe("delivery");
  });

  it("still refuses anything outside the three modes", async () => {
    // Drizzle's enum is TypeScript-only; the CHECK constraint is what actually
    // holds, so it has to be exercised past the types.
    await expect(
      makeOrder(ORDER, { fulfilment: "teletrasporto" as "pickup" }),
    ).rejects.toThrow();
  });
});

describe("delivery_zones", () => {
  it("refuses a negative fee", async () => {
    await expect(makeZone({ feeCents: -1 })).rejects.toThrow();
  });

  it("refuses a mode outside delivery/shipping", async () => {
    await expect(makeZone({ mode: "teleport" as "delivery" })).rejects.toThrow();
  });

  it("cannot be deleted once it has priced an order", async () => {
    // RESTRICT, not SET NULL: `shippingCents` records what was charged, but the
    // round the order belonged to is what the daily screen groups by — losing it
    // silently would empty that grouping. Suspending is the way out.
    await makeZone();
    await makeOrder(ORDER, { fulfilment: "delivery", deliveryZoneId: ZONE });
    await expect(db.delete(deliveryZones).where(eq(deliveryZones.id, ZONE))).rejects.toThrow();

    await db.update(deliveryZones).set({ active: false }).where(eq(deliveryZones.id, ZONE));
    const [row] = await db.select().from(deliveryZones).where(eq(deliveryZones.id, ZONE));
    expect(row.active).toBe(false);

    // And an unused zone deletes cleanly.
    await db.delete(orders).where(eq(orders.id, ORDER));
    await db.delete(deliveryZones).where(eq(deliveryZones.id, ZONE));
    expect(await db.select().from(deliveryZones).where(eq(deliveryZones.id, ZONE))).toHaveLength(0);
  });

  it("hides a suspended zone from the storefront read", async () => {
    await makeZone({ active: false });
    const visible = await getDeliveryZones();
    expect(visible.some((z) => z.id === ZONE)).toBe(false);
  });
});

describe("pickup_slots", () => {
  const base = { shopSlug: SHOP, weekday: 6, startTime: "09:00", endTime: "10:00" };

  it("refuses a window that ends before it starts", async () => {
    await expect(
      db.insert(pickupSlots).values({ ...base, startTime: "10:00", endTime: "09:00" }),
    ).rejects.toThrow();
  });

  it("refuses a zero-length window", async () => {
    await expect(
      db.insert(pickupSlots).values({ ...base, startTime: "09:00", endTime: "09:00" }),
    ).rejects.toThrow();
  });

  it("refuses a weekday outside 1–7", async () => {
    await expect(db.insert(pickupSlots).values({ ...base, weekday: 8 })).rejects.toThrow();
  });

  it("refuses the same start twice on one day", async () => {
    await db.insert(pickupSlots).values(base);
    await expect(db.insert(pickupSlots).values({ ...base, endTime: "11:00" })).rejects.toThrow();
  });
});

describe("getPickupSlotCounts", () => {
  const at = instantInRome("2099-06-06", "09:00");

  it("counts live orders in a window and releases cancelled ones", async () => {
    await makeOrder(ORDER, { fulfilment: "pickup", pickupSlotAt: at, status: "paid" });
    await makeOrder(`${ORDER}-2`, { fulfilment: "pickup", pickupSlotAt: at, status: "pending" });
    await makeOrder(`${ORDER}-3`, { fulfilment: "pickup", pickupSlotAt: at, status: "cancelled" });

    const counts = await getPickupSlotCounts(at.getTime() - 1);
    // A window held by an order nobody is coming to collect is a place the shop
    // must be able to sell again.
    expect(counts.get(`${SHOP}|${at.getTime()}`)).toBe(2);
  });
});

describe("getFulfilmentDay", () => {
  const at = instantInRome("2099-06-06", "09:00");
  const fromMs = instantInRome("2099-06-06", "00:00").getTime();
  const toMs = instantInRome("2099-06-07", "00:00").getTime();

  it("lists what still has to be handed over, and nothing that never will", async () => {
    // A contrassegno sits unpaid until the doorstep: it is the delivery queue's
    // whole reason to exist, and "paid and not fulfilled" used to hide it.
    await makeOrder(ORDER, {
      fulfilment: "delivery",
      paymentMethod: "on_delivery",
      status: "pending",
      paymentStatus: "unpaid",
      totalCents: 4200,
    });
    await db.insert(orderItems).values({
      orderId: ORDER,
      name: "Ciauscolo",
      unitPriceCents: 1000,
      quantity: 2,
      lineTotalCents: 2000,
    });
    // A card checkout nobody finished: not a sale, not "da incassare".
    await makeOrder(`${ORDER}-2`, { fulfilment: "pickup", pickupSlotAt: at, status: "pending" });
    // Collected already: stays on its day, so the sheet reads as the day's list.
    await makeOrder(`${ORDER}-3`, {
      fulfilment: "pickup",
      pickupSlotAt: at,
      status: "fulfilled",
      paymentStatus: "paid",
    });
    // A courier parcel belongs to no sede and must survive the sede filter.
    await makeOrder(`${ORDER}-4`, {
      fulfilment: "shipping",
      shopSlug: null,
      status: "paid",
      paymentStatus: "paid",
    });

    const day = await getFulfilmentDay(fromMs, toMs, SHOP);
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

    expect(ids(day.deliveries)).toContain(ORDER);
    expect(ids(day.pickups)).not.toContain(`${ORDER}-2`);
    expect(ids(day.pickups)).toContain(`${ORDER}-3`);
    expect(ids(day.shipments)).toContain(`${ORDER}-4`);
    expect(day.lines.get(ORDER)).toEqual([{ name: "Ciauscolo", quantity: 2, weightKg: null }]);
  });
});

describe("createOrder, end to end", () => {
  const CAP_ZONE = "ff-zone-cap";
  const PROD = "ff-test-porchetta";

  beforeEach(async () => {
    await db.delete(orders).where(eq(orders.email, "ff@example.com"));
    await db.delete(deliveryZones).where(eq(deliveryZones.id, CAP_ZONE));
    await db
      .insert(products)
      .values({
        slug: PROD,
        name: "Porchetta di prova",
        shopSlug: SHOP,
        priceCents: 2000,
        unit: "kg",
        soldByWeight: true,
        purchasable: true,
        active: true,
      })
      .onConflictDoNothing({ target: products.slug });
    await db.update(shops).set({ storeEnabled: true }).where(eq(shops.slug, SHOP));
  });

  const checkout = (over: Partial<CheckoutInput> = {}): CheckoutInput =>
    ({
      items: [{ slug: PROD, quantity: 2 }],
      name: "Prova",
      email: "ff@example.com",
      fulfilment: "pickup",
      shopSlug: SHOP,
      ...over,
    }) as CheckoutInput;

  it("prices a delivery from the zone serving the CAP and records which one", async () => {
    await db.insert(deliveryZones).values({
      id: CAP_ZONE,
      name: "Giro locale",
      mode: "delivery",
      postcodes: ["601"],
      feeCents: 300,
      perKgCents: 100,
    });

    const created = await createOrder(
      checkout({ fulfilment: "delivery", address: "Via Roma 1", city: "Ancona", zip: "60121" }),
    );
    const [row] = await db.select().from(orders).where(eq(orders.id, created.orderId));

    // 2 kg of a product sold by weight: 300 flat + 2 x 100 per kg.
    expect(row.shippingCents).toBe(500);
    expect(row.totalCents).toBe(4000 + 500);
    expect(row.deliveryZoneId).toBe(CAP_ZONE);
    expect(row.shippingAddress?.zip).toBe("60121");
  });

  it("refuses a CAP no zone serves rather than shipping it for free", async () => {
    await db.insert(deliveryZones).values({
      id: CAP_ZONE,
      name: "Giro locale",
      mode: "delivery",
      postcodes: ["601"],
      feeCents: 300,
    });
    await expect(
      createOrder(
        checkout({ fulfilment: "delivery", address: "Via Roma 1", city: "Milano", zip: "20121" }),
      ),
    ).rejects.toThrow(/20121/);
  });

  it("refuses an under-minimum basket", async () => {
    await db.insert(deliveryZones).values({
      id: CAP_ZONE,
      name: "Giro locale",
      mode: "delivery",
      postcodes: ["601"],
      feeCents: 300,
      minOrderCents: 10_000,
    });
    await expect(
      createOrder(
        checkout({ fulfilment: "delivery", address: "Via Roma 1", city: "Ancona", zip: "60121" }),
      ),
    ).rejects.toThrow(/minimo/i);
  });

  it("stores the chosen pickup window, and insists on one once slots exist", async () => {
    // Cover every weekday so the assertion doesn't depend on the day it runs.
    for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
      await db.insert(pickupSlots).values({
        shopSlug: SHOP,
        weekday,
        startTime: "23:30",
        endTime: "23:45",
        cutoffHours: 0,
      });
    }

    // The shop now publishes windows, so "no window" is no longer an option.
    await expect(createOrder(checkout())).rejects.toThrow(/orario di ritiro/i);

    const options = pickupSlotOptions(await getPickupSlots(SHOP), { days: 3 });
    expect(options.length).toBeGreaterThan(0);
    const created = await createOrder(checkout({ pickupSlot: options[0].value }));
    const [row] = await db.select().from(orders).where(eq(orders.id, created.orderId));
    expect(row.pickupSlotAt?.getTime()).toBe(options[0].atMs);

    // A time that is on no schedule is refused even though it parses.
    await expect(createOrder(checkout({ pickupSlot: "2099-01-01T04:00" }))).rejects.toThrow();
  });

  it("asks for no window where the shop publishes none", async () => {
    // The pre-slot behaviour, which every existing install depends on.
    const created = await createOrder(checkout());
    const [row] = await db.select().from(orders).where(eq(orders.id, created.orderId));
    expect(row.pickupSlotAt).toBeNull();
    expect(row.shippingCents).toBe(0);
  });
});
