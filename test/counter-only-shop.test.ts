import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orderItems, orders, products, settings, shops } from "@/lib/db/schema";
import { createOrder, finalizeOrder, registerOfflineOrder } from "@/lib/orders";
import { paymentMethodsFor, modalitaPagamento } from "@/lib/payments/methods";
import { getPaymentAvailability } from "@/lib/payments/config";
import type { CheckoutInput } from "@/lib/validation/order";

/**
 * Place an order the way `POST /api/checkout` does for a non-card method:
 * create it, then register it — which is what reserves the goods and tells the
 * customer what to bring. `createOrder` on its own deliberately reserves
 * nothing, because a card order must not hold stock before it is paid.
 */
async function placeCounterOrder(over: Partial<CheckoutInput> = {}) {
  const created = await createOrder(basket(over));
  await registerOfflineOrder(created.orderId);
  return created;
}

/**
 * The shop as it will actually run: no online payment at all.
 *
 * The owner settled this on 2026-09-02 — money is taken at the counter, in cash
 * or on the POS, and the website's job is to take the order rather than the
 * payment. This suite is the proof that the configuration holds end to end,
 * because "counter only" is a *setting* here rather than a rewrite: card is
 * gated on `payments.cardEnabled` **and** on Stripe being usable, so a deploy
 * that never had keys already offers "paga in bottega" instead of a card button
 * that dead-ends.
 *
 * It matters that this is a switch and not a deletion. The distinction the
 * invoice depends on — contanti is MP01, POS is MP08 — is untouched by the
 * decision, and a shop that later wants online payment turns the switch back on.
 */

const SHOP = "counter-only-shop";
const PRODUCT = "counter-only-prod";
const EMAIL = "counter-only@example.com";

const basket = (over: Partial<CheckoutInput> = {}): CheckoutInput =>
  ({
    items: [{ slug: PRODUCT, quantity: 2 }],
    name: "Cliente al banco",
    email: EMAIL,
    fulfilment: "pickup",
    shopSlug: SHOP,
    paymentMethod: "in_store",
    ...over,
  }) as CheckoutInput;

const readOrder = async (id: string) =>
  (await db.select().from(orders).where(eq(orders.id, id)).limit(1))[0]!;

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Sede banco", specialty: "test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(products)
    .values({
      slug: PRODUCT,
      name: "Ciauscolo",
      shopSlug: SHOP,
      priceCents: 500,
      stock: 50,
      purchasable: true,
      active: true,
    })
    .onConflictDoNothing({ target: products.slug });
});

beforeEach(async () => {
  const old = await db.select({ id: orders.id }).from(orders).where(eq(orders.email, EMAIL));
  if (old.length) {
    await db.delete(orderItems).where(inArray(orderItems.orderId, old.map((o) => o.id)));
    await db.delete(orders).where(inArray(orders.id, old.map((o) => o.id)));
  }
  await db.update(products).set({ stock: 50 }).where(eq(products.slug, PRODUCT));
  // The counter-only configuration, applied the way an owner would.
  for (const [key, value] of [
    ["payments.cardEnabled", false],
    ["payments.inStoreEnabled", true],
    ["payments.onDeliveryEnabled", true],
  ] as const) {
    await db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } });
  }
});

describe("a shop that takes no money online", () => {
  it("offers no card option at the checkout", async () => {
    const availability = await getPaymentAvailability();
    expect(availability.cardEnabled).toBe(false);

    const offered = paymentMethodsFor("pickup", 2000, availability);
    expect(offered).not.toContain("card");
    expect(offered).toContain("in_store");
  });

  it("still offers contrassegno on a delivery, which is money at the door", async () => {
    const offered = paymentMethodsFor("delivery", 2000, await getPaymentAvailability());
    expect(offered).toContain("on_delivery");
    expect(offered).not.toContain("card");
  });

  it("refuses a card order posted directly, rather than humouring it", async () => {
    // The checkout page will not offer it; the API is reachable by more than
    // the checkout page.
    await expect(createOrder(basket({ paymentMethod: "card" }))).rejects.toThrow(/non disponibile/i);
  });

  it("takes the order, reserves the goods, and leaves the money owed", async () => {
    const created = await placeCounterOrder();
    const order = await readOrder(created.orderId);

    expect(order.paymentMethod).toBe("in_store");
    expect(order.paymentStatus).toBe("unpaid");
    // The meat is set aside the moment the order is placed — a shop that only
    // decremented at payment would keep selling what it has promised.
    expect(order.stockAppliedAt).not.toBeNull();
  });

  it("settles at the counter, recording which instrument took the money", async () => {
    const created = await placeCounterOrder();
    await finalizeOrder(created.orderId, { paidWith: "pos" });

    const order = await readOrder(created.orderId);
    expect(order.paymentStatus).toBe("paid");
    expect(order.paidWith).toBe("pos");
    expect(order.paidAt).not.toBeNull();
    // The distinction the invoice depends on survives the decision entirely:
    // contanti is MP01, the POS is MP08.
    expect(modalitaPagamento(order.paymentMethod, order.paidWith)).toBe("MP08");
  });

  it("records a cash settlement as cash", async () => {
    const created = await placeCounterOrder();
    await finalizeOrder(created.orderId, { paidWith: "cash" });
    const order = await readOrder(created.orderId);
    expect(modalitaPagamento(order.paymentMethod, order.paidWith)).toBe("MP01");
  });

  it("does not decrement the goods a second time when the money arrives", async () => {
    const created = await placeCounterOrder();
    const afterOrder = (await db.select().from(products).where(eq(products.slug, PRODUCT)))[0]!.stock;

    await finalizeOrder(created.orderId, { paidWith: "cash" });

    const afterPayment = (await db.select().from(products).where(eq(products.slug, PRODUCT)))[0]!.stock;
    expect(afterPayment).toBe(afterOrder);
  });

  it("can be switched back on, because it is a setting and not a deletion", async () => {
    await db
      .insert(settings)
      .values({ key: "payments.cardEnabled", value: true })
      .onConflictDoUpdate({ target: settings.key, set: { value: true } });

    // In development, `simulatedPayments` stands in for Stripe, so the switch
    // alone brings card back. On a real deploy the second half of the gate
    // applies too — no keys means no card button, rather than one that
    // dead-ends — which is what makes turning this off safe to do first and
    // decide about later.
    expect((await getPaymentAvailability()).cardEnabled).toBe(true);
  });
});
