import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, orderItems, products, shops, settings, deliveryZones } from "@/lib/db/schema";
import {
  createOrder,
  finalizeOrder,
  registerOfflineOrder,
  applyOrderStock,
  restockOrderItems,
  expireOrder,
} from "@/lib/orders";
import { runAbandonedOrderSweep } from "@/lib/automation";
import {
  paymentMethodsFor,
  paymentMethodError,
  modalitaPagamento,
  settlesOnHandover,
  type PaymentAvailability,
} from "@/lib/payments/methods";
import type { CheckoutInput } from "@/lib/validation/order";

/**
 * The payment cycle end to end: which methods an order may use, what happens to
 * stock when payment and handover are different moments, and which unpaid orders
 * the abandoned-checkout sweep is allowed to touch.
 *
 * The invariants here are the ones no UI test reaches: that goods leave stock
 * exactly once whichever moment applied them, that an order awaiting payment at
 * the counter is never mistaken for a dead checkout, and that the instrument the
 * money arrived on survives all the way to the invoice.
 */

const SHOP = "pay-test-shop";
const PRODUCT = "pay-test-prod";
const ZONE = "pay-test-zone";
const ALL: PaymentAvailability = {
  cardEnabled: true,
  inStoreEnabled: true,
  onDeliveryEnabled: true,
  onDeliveryMaxCents: 0,
};

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Pagamenti", specialty: "test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(products)
    .values({
      slug: PRODUCT,
      name: "Salame di prova",
      shopSlug: SHOP,
      category: "salumi",
      priceCents: 1000,
      stock: 100,
      purchasable: true,
      active: true,
    })
    .onConflictDoUpdate({
      target: products.slug,
      set: { priceCents: 1000, stock: 100, purchasable: true, active: true },
    });
});

beforeEach(async () => {
  // Every order this file makes is numbered `ORD-…`; clear them plus the two
  // settings the sweep and the contrassegno cap read, so one test's tuning
  // cannot decide another's outcome.
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.shopSlug, SHOP));
  if (mine.length) {
    await db.delete(orderItems).where(
      inArray(
        orderItems.orderId,
        mine.map((o) => o.id),
      ),
    );
    await db.delete(orders).where(
      inArray(
        orders.id,
        mine.map((o) => o.id),
      ),
    );
  }
  await db.delete(settings).where(like(settings.key, "payments.%"));
  await db.delete(settings).where(eq(settings.key, "orders.abandonedAfterHours"));
  await db.update(products).set({ stock: 100 }).where(eq(products.slug, PRODUCT));
});

function checkout(over: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    items: [{ slug: PRODUCT, quantity: 2 }],
    name: "Cliente Prova",
    email: "cliente@example.com",
    fulfilment: "pickup",
    shopSlug: SHOP,
    paymentMethod: "card",
    ...over,
  } as CheckoutInput;
}

const readStock = async () =>
  (await db.select({ stock: products.stock }).from(products).where(eq(products.slug, PRODUCT)).limit(1))[0]
    .stock;
const readOrder = async (id: string) =>
  (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0];

// ── Rules (pure) ─────────────────────────────────────────────────────────────

describe("paymentMethodsFor", () => {
  it("offers pay-in-store only for pickup, and contrassegno only for delivery", () => {
    expect(paymentMethodsFor("pickup", 5000, ALL)).toEqual(["card", "in_store"]);
    expect(paymentMethodsFor("delivery", 5000, ALL)).toEqual(["card", "on_delivery"]);
    // A courier is nobody's counter and carries no POS.
    expect(paymentMethodsFor("shipping", 5000, ALL)).toEqual(["card"]);
  });

  it("withdraws contrassegno above the cap, leaving the card", () => {
    const capped = { ...ALL, onDeliveryMaxCents: 5000 };
    expect(paymentMethodsFor("delivery", 5000, capped)).toContain("on_delivery");
    expect(paymentMethodsFor("delivery", 5001, capped)).toEqual(["card"]);
  });

  it("returns nothing when the shop has turned everything off", () => {
    const none = { ...ALL, cardEnabled: false, inStoreEnabled: false };
    expect(paymentMethodsFor("pickup", 1000, none)).toEqual([]);
  });

  it("hides the card when Stripe is unusable, without hiding the rest", () => {
    expect(paymentMethodsFor("pickup", 1000, { ...ALL, cardEnabled: false })).toEqual(["in_store"]);
  });
});

describe("paymentMethodError", () => {
  it("says why, in the customer's words", () => {
    expect(paymentMethodError("in_store", "shipping", 1000, ALL)).toMatch(/solo con il ritiro/);
    expect(paymentMethodError("on_delivery", "pickup", 1000, ALL)).toMatch(/solo con la consegna/);
    expect(paymentMethodError("on_delivery", "delivery", 6000, { ...ALL, onDeliveryMaxCents: 5000 })).toMatch(
      /50\.00 €/,
    );
    expect(paymentMethodError("card", "pickup", 1000, ALL)).toBeNull();
  });
});

describe("modalitaPagamento", () => {
  it("reports what the money actually arrived on, not what was planned", () => {
    // The whole reason `paidWith` exists: the same "pago al ritiro" order is
    // MP01 in cash and MP08 on the POS, and the invoice cannot guess.
    expect(modalitaPagamento("in_store", "cash")).toBe("MP01");
    expect(modalitaPagamento("in_store", "pos")).toBe("MP08");
    expect(modalitaPagamento("counter", "transfer")).toBe("MP05");
    expect(modalitaPagamento("card", "card")).toBe("MP08");
  });

  it("falls back sensibly for an invoice issued before settlement", () => {
    expect(modalitaPagamento("card", null)).toBe("MP08");
    expect(modalitaPagamento("in_store", null)).toBe("MP01");
  });
});

// ── createOrder ──────────────────────────────────────────────────────────────

describe("createOrder — payment method", () => {
  it("records a pay-in-store pickup as unpaid, with the method on the row", async () => {
    const created = await createOrder(checkout({ paymentMethod: "in_store" }));
    expect(created.paymentMethod).toBe("in_store");

    const order = await readOrder(created.orderId);
    expect(order.paymentMethod).toBe("in_store");
    expect(order.paymentStatus).toBe("unpaid");
    expect(order.paidWith).toBeNull();
  });

  it("refuses a method the fulfilment mode cannot support", async () => {
    // The client is free to post anything; the server prices and rules from its
    // own data, so this is refused here rather than humoured and charged later.
    await expect(
      createOrder(checkout({ fulfilment: "shipping", address: "Via Prova 1", city: "Ancona", zip: "60121", paymentMethod: "in_store" })),
    ).rejects.toThrow(/solo con il ritiro/);
  });

  it("refuses contrassegno above the shop's cap", async () => {
    // A zone has to exist first: carriage is gated before payment, so without
    // one the order is refused for the CAP and never reaches the cap rule.
    await db.insert(deliveryZones).values({
      id: ZONE,
      name: "Zona pagamenti",
      mode: "delivery",
      postcodes: ["60121"],
      feeCents: 0,
      shopSlug: SHOP,
    });
    try {
      await db.insert(settings).values({ key: "payments.onDeliveryMaxCents", value: 1000 });
      await expect(
        createOrder(
          checkout({
            fulfilment: "delivery",
            address: "Via Prova 1",
            city: "Ancona",
            zip: "60121",
            paymentMethod: "on_delivery",
          }),
        ),
      ).rejects.toThrow(/contrassegno è disponibile fino a/);
    } finally {
      // Zones are global to `quoteCarriage`, and the files share one DB — a
      // leftover zone would silently re-price another file's orders.
      await db.delete(deliveryZones).where(eq(deliveryZones.id, ZONE));
    }
  });

  it("refuses a method the shop has switched off", async () => {
    await db.insert(settings).values({ key: "payments.inStoreEnabled", value: false });
    await expect(createOrder(checkout({ paymentMethod: "in_store" }))).rejects.toThrow(
      /non disponibile/,
    );
  });

  it("defaults to card when called without a method", async () => {
    const { paymentMethod, ...rest } = checkout();
    void paymentMethod;
    const created = await createOrder(rest as CheckoutInput);
    expect((await readOrder(created.orderId)).paymentMethod).toBe("card");
  });
});

// ── Stock: applied once, whenever that moment is ─────────────────────────────

describe("applyOrderStock", () => {
  it("reserves the goods when an order to be paid on collection is accepted", async () => {
    const created = await createOrder(checkout({ paymentMethod: "in_store" }));
    await registerOfflineOrder(created.orderId);

    // The meat has to come off the shelf now — the customer is collecting on
    // Thursday and the shop must not sell it twice in the meantime.
    expect(await readStock()).toBe(98);
    expect((await readOrder(created.orderId)).stockAppliedAt).not.toBeNull();
  });

  it("does not reserve twice when the order is registered again", async () => {
    const created = await createOrder(checkout({ paymentMethod: "in_store" }));
    await registerOfflineOrder(created.orderId);
    await registerOfflineOrder(created.orderId);
    expect(await readStock()).toBe(98);
  });

  it("does not decrement a second time when the payment is finally taken", async () => {
    const created = await createOrder(checkout({ paymentMethod: "in_store" }));
    await registerOfflineOrder(created.orderId);
    expect(await readStock()).toBe(98);

    await finalizeOrder(created.orderId, { paidWith: "cash" });

    const order = await readOrder(created.orderId);
    expect(order.paymentStatus).toBe("paid");
    expect(order.paidWith).toBe("cash");
    // Still 98: the goods left stock when they were reserved, not again now.
    expect(await readStock()).toBe(98);
  });

  it("applies at payment for a card order, which reserved nothing", async () => {
    const created = await createOrder(checkout());
    expect(await readStock()).toBe(100);

    await finalizeOrder(created.orderId, { paymentIntentId: "pi_test_123" });
    expect(await readStock()).toBe(98);
    expect((await readOrder(created.orderId)).paidWith).toBe("card");
  });

  it("is claimed by exactly one of two concurrent callers", async () => {
    const created = await createOrder(checkout());
    const [a, b] = await Promise.all([
      applyOrderStock(created.orderId, "gara A"),
      applyOrderStock(created.orderId, "gara B"),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await readStock()).toBe(98);
  });
});

describe("restockOrderItems", () => {
  it("gives back an unpaid reservation, and only once", async () => {
    const created = await createOrder(checkout({ paymentMethod: "in_store" }));
    await registerOfflineOrder(created.orderId);
    expect(await readStock()).toBe(98);

    await restockOrderItems(created.orderId, "Annullo");
    expect(await readStock()).toBe(100);
    expect((await readOrder(created.orderId)).stockAppliedAt).toBeNull();

    // A second cancel — a double-clicked button, a replayed webhook — must not
    // conjure two more salami out of the ledger.
    await restockOrderItems(created.orderId, "Annullo");
    expect(await readStock()).toBe(100);
  });

  it("gives back nothing for an order that never took any", async () => {
    const created = await createOrder(checkout());
    await restockOrderItems(created.orderId, "Checkout abbandonato");
    expect(await readStock()).toBe(100);
  });
});

// ── Abandoned checkouts ──────────────────────────────────────────────────────

describe("expireOrder", () => {
  it("releases an unpaid card checkout", async () => {
    const created = await createOrder(checkout());
    expect(await expireOrder(created.orderId)).toBe(true);
    expect((await readOrder(created.orderId)).status).toBe("cancelled");
  });

  it("refuses to touch an order that is meant to be unpaid", async () => {
    // The difference that matters: this customer is coming on Thursday with the
    // money. Sweeping it away would cancel a real sale and shelve reserved goods.
    const created = await createOrder(checkout({ paymentMethod: "in_store" }));
    await registerOfflineOrder(created.orderId);

    expect(await expireOrder(created.orderId)).toBe(false);
    expect((await readOrder(created.orderId)).status).toBe("pending");
    expect(await readStock()).toBe(98);
  });

  it("refuses to touch an order that was paid", async () => {
    const created = await createOrder(checkout());
    await finalizeOrder(created.orderId, { paidWith: "card" });
    expect(await expireOrder(created.orderId)).toBe(false);
  });
});

describe("runAbandonedOrderSweep", () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  it("cancels stale card checkouts and leaves collection orders alone", async () => {
    const card = await createOrder(checkout());
    const inStore = await createOrder(checkout({ paymentMethod: "in_store" }));
    await registerOfflineOrder(inStore.orderId);
    await db
      .update(orders)
      .set({ createdAt: hoursAgo(48) })
      .where(inArray(orders.id, [card.orderId, inStore.orderId]));

    const result = await runAbandonedOrderSweep();

    expect(result.cancelled).toBe(1);
    expect((await readOrder(card.orderId)).status).toBe("cancelled");
    expect((await readOrder(inStore.orderId)).status).toBe("pending");
  });

  it("leaves a checkout that is still within the window", async () => {
    const card = await createOrder(checkout());
    await db.update(orders).set({ createdAt: hoursAgo(2) }).where(eq(orders.id, card.orderId));

    await runAbandonedOrderSweep();
    expect((await readOrder(card.orderId)).status).toBe("pending");
  });

  it("is disabled at zero", async () => {
    await db.insert(settings).values({ key: "orders.abandonedAfterHours", value: 0 });
    const card = await createOrder(checkout());
    await db.update(orders).set({ createdAt: hoursAgo(500) }).where(eq(orders.id, card.orderId));

    expect((await runAbandonedOrderSweep()).cancelled).toBe(0);
    expect((await readOrder(card.orderId)).status).toBe("pending");
  });
});

describe("settlesOnHandover", () => {
  it("separates the methods that legitimately sit unpaid", () => {
    expect(settlesOnHandover("in_store")).toBe(true);
    expect(settlesOnHandover("on_delivery")).toBe(true);
    expect(settlesOnHandover("card")).toBe(false);
    expect(settlesOnHandover("counter")).toBe(false);
  });
});
