import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderItems, orders, pickupSlots, products, shops } from "@/lib/db/schema";
import { createOrder } from "@/lib/orders";
import type { CheckoutInput } from "@/lib/validation/order";

/**
 * A capped pickup window has to hold at the moment the order is written.
 *
 * `resolvePickupSlot` counts what is booked and hands back an answer; the order
 * is inserted some way further down, in its own transaction. Two customers
 * taking the last place in a Saturday window at the same moment therefore both
 * passed — the count each of them read was taken before either row existed, and
 * the shop found out when two people arrived for one slot.
 */

const SHOP = "cap-shop";
const SLUG = "cap-prod";
const EMAIL = "cap@example.com";
const WEEKDAY = 3; // Wednesday

/** The next occurrence of a weekday, far enough out to clear any cut-off. */
function nextWeekdayIso(weekday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 3);
  while (((d.getUTCDay() + 6) % 7) + 1 !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const DATE = nextWeekdayIso(WEEKDAY);

const basket = (): CheckoutInput =>
  ({
    items: [{ slug: SLUG, quantity: 1 }],
    name: "Cliente",
    email: EMAIL,
    fulfilment: "pickup",
    paymentMethod: "in_store",
    shopSlug: SHOP,
    pickupSlot: `${DATE}T10:00`,
  }) as CheckoutInput;

const bookedOrders = () => db.select().from(orders).where(eq(orders.email, EMAIL));

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Sede capienza", specialty: "test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(products)
    .values({ slug: SLUG, name: "Prodotto", shopSlug: SHOP, priceCents: 500, purchasable: true, active: true })
    .onConflictDoNothing({ target: products.slug });
});

beforeEach(async () => {
  const old = await db.select({ id: orders.id }).from(orders).where(eq(orders.email, EMAIL));
  if (old.length) {
    await db.delete(orderItems).where(inArray(orderItems.orderId, old.map((o) => o.id)));
    await db.delete(orders).where(inArray(orders.id, old.map((o) => o.id)));
  }
  await db.delete(pickupSlots).where(eq(pickupSlots.shopSlug, SHOP));
  await db.insert(pickupSlots).values({
    shopSlug: SHOP,
    weekday: WEEKDAY,
    startTime: "10:00",
    endTime: "11:00",
    capacityOrders: 1,
    cutoffHours: 0,
    active: true,
  });
});

describe("capped pickup windows", () => {
  it("accepts the first order into a window of one", async () => {
    const created = await createOrder(basket());
    expect(created.orderId).toBeTruthy();
  });

  it("refuses the second, in sequence", async () => {
    await createOrder(basket());
    await expect(createOrder(basket())).rejects.toThrow(/non è più disponibile|si è appena riempito/);
    expect(await bookedOrders()).toHaveLength(1);
  });

  it("does not re-check a window with no capacity set", async () => {
    await db.update(pickupSlots).set({ capacityOrders: null }).where(eq(pickupSlots.shopSlug, SHOP));
    await createOrder(basket());
    await createOrder(basket());
    expect(await bookedOrders()).toHaveLength(2);
  });

  // Last on purpose. Two contended transactions against one SQLite file leave
  // it busy for a moment afterwards, and a sequential test starting inside that
  // window inherits the SQLITE_BUSY instead of its own result. Having to order
  // a suite around that is itself the finding recorded against system 22:
  // `PRAGMA busy_timeout = 5000` is already set, and does not cover a contended
  // commit.
  it("lets only one of two simultaneous orders take the last place", async () => {
    // Settled rather than awaited: the loser surfaces either as the refusal the
    // re-count raises or as that thrown SQLITE_BUSY. Either way it does not get
    // the slot, which is the property under test.
    const settled = await Promise.allSettled([createOrder(basket()), createOrder(basket())]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await bookedOrders()).toHaveLength(1);
  });
});
