import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, users, orders, discountCodes, discountRedemptions } from "@/lib/db/schema";
import {
  validateDiscount,
  recordDiscountUseByCode,
  releaseDiscountUseByCode,
  getDiscountUses,
} from "@/lib/discounts";
import { hashPasswordAsync } from "@/lib/auth/password";

/**
 * Coupon limits.
 *
 * The cap used to be checked in `validateDiscount` and incremented separately at
 * payment, so two checkouts settling together could both take the last use of a
 * one-shot code. There was also no per-customer limit, no first-order rule and
 * no scoping — a "benvenuto" code worked every week, forever, at either shop.
 */

const SHOP_A = "disc-shop-a";
const SHOP_B = "disc-shop-b";
let customerId = "";
const EMAIL = "coupon@example.com";

async function makeCode(code: string, extra: Partial<typeof discountCodes.$inferInsert> = {}) {
  await db.delete(discountRedemptions).where(eq(discountRedemptions.discountCode, code));
  await db.delete(discountCodes).where(eq(discountCodes.code, code));
  await db.insert(discountCodes).values({
    code,
    type: "fixed",
    value: 500,
    active: true,
    ...extra,
  });
}

beforeAll(async () => {
  for (const slug of [SHOP_A, SHOP_B]) {
    await db
      .insert(shops)
      .values({ slug, name: `Sede ${slug}`, specialty: "test" })
      .onConflictDoNothing();
  }
  const [u] = await db
    .insert(users)
    .values({
      username: `coupon-${Date.now()}`,
      name: "Cliente Coupon",
      email: EMAIL,
      passwordHash: await hashPasswordAsync("password123"),
      role: "customer",
    })
    .returning({ id: users.id });
  customerId = u.id;
});

beforeEach(async () => {
  await db.delete(orders).where(eq(orders.email, EMAIL));
});

describe("global cap", () => {
  it("is claimed atomically: the second use of a one-shot code is refused", async () => {
    await makeCode("ONESHOT", { maxRedemptions: 1 });

    // Both callers validated successfully before either recorded — the race the
    // old non-atomic increment left open.
    expect(await validateDiscount("ONESHOT", 5000)).not.toBeNull();
    expect(await validateDiscount("ONESHOT", 5000)).not.toBeNull();

    expect(await recordDiscountUseByCode("ONESHOT", { email: "a@example.com" })).toBe(true);
    // The conditional UPDATE refuses the second claim rather than pushing
    // timesUsed past the cap.
    expect(await recordDiscountUseByCode("ONESHOT", { email: "b@example.com" })).toBe(false);

    const [row] = await db.select().from(discountCodes).where(eq(discountCodes.code, "ONESHOT"));
    expect(row.timesUsed).toBe(1);
    expect(await validateDiscount("ONESHOT", 5000)).toBeNull();
  });

  it("frees a use when the order is reversed", async () => {
    await makeCode("REFUNDABLE", { maxRedemptions: 1 });
    await recordDiscountUseByCode("REFUNDABLE", { orderId: "ord-1", email: EMAIL });
    expect(await validateDiscount("REFUNDABLE", 5000)).toBeNull();

    await releaseDiscountUseByCode("REFUNDABLE", "ord-1");
    expect(await validateDiscount("REFUNDABLE", 5000)).not.toBeNull();
    // The ledger row goes too, so a per-customer cap is genuinely freed.
    expect(await getDiscountUses("REFUNDABLE")).toHaveLength(0);
  });
});

describe("per-customer limit", () => {
  it("stops the same account using a code twice", async () => {
    await makeCode("PERCLIENTE", { maxPerCustomer: 1 });
    const who = { userId: customerId, email: EMAIL };

    expect(await validateDiscount("PERCLIENTE", 5000, who)).not.toBeNull();
    await recordDiscountUseByCode("PERCLIENTE", { userId: customerId, email: EMAIL });
    expect(await validateDiscount("PERCLIENTE", 5000, who)).toBeNull();

    // Someone else is unaffected.
    expect(await validateDiscount("PERCLIENTE", 5000, { email: "altro@example.com" })).not.toBeNull();
  });

  it("identifies a guest by order email", async () => {
    await makeCode("GUESTONCE", { maxPerCustomer: 1 });
    const guest = { email: "guest@example.com" };
    expect(await validateDiscount("GUESTONCE", 5000, guest)).not.toBeNull();
    await recordDiscountUseByCode("GUESTONCE", guest);
    expect(await validateDiscount("GUESTONCE", 5000, guest)).toBeNull();
  });

  it("ignores the limit when nothing identifies the customer", async () => {
    await makeCode("ANON", { maxPerCustomer: 1 });
    await recordDiscountUseByCode("ANON", { email: EMAIL });
    // No identity supplied → the cap can't be applied, so the code still works.
    expect(await validateDiscount("ANON", 5000)).not.toBeNull();
  });
});

describe("first-order-only", () => {
  it("applies to a customer with no settled order and not to one with", async () => {
    await makeCode("BENVENUTO", { firstOrderOnly: true });
    const who = { userId: customerId, email: EMAIL };
    expect(await validateDiscount("BENVENUTO", 5000, who)).not.toBeNull();

    await db.insert(orders).values({
      orderNumber: `FO-${Date.now()}`,
      userId: customerId,
      email: EMAIL,
      name: "Cliente Coupon",
      fulfilment: "pickup",
      shopSlug: SHOP_A,
      subtotalCents: 1000,
      totalCents: 1000,
      status: "paid",
      paymentStatus: "paid",
      paidAt: new Date(),
    });

    expect(await validateDiscount("BENVENUTO", 5000, who)).toBeNull();
  });

  it("doesn't count an unpaid draft as a previous order", async () => {
    await makeCode("PRIMO", { firstOrderOnly: true });
    await db.insert(orders).values({
      orderNumber: `FO2-${Date.now()}`,
      userId: customerId,
      email: EMAIL,
      name: "Cliente Coupon",
      fulfilment: "pickup",
      shopSlug: SHOP_A,
      subtotalCents: 1000,
      totalCents: 1000,
      status: "pending",
      paymentStatus: "unpaid",
    });
    expect(await validateDiscount("PRIMO", 5000, { userId: customerId })).not.toBeNull();
  });
});

describe("shop scoping", () => {
  it("only applies at the shop it is scoped to", async () => {
    await makeCode("SOLOCENTRO", { shopSlug: SHOP_A });
    expect(await validateDiscount("SOLOCENTRO", 5000, { shopSlug: SHOP_A })).not.toBeNull();
    expect(await validateDiscount("SOLOCENTRO", 5000, { shopSlug: SHOP_B })).toBeNull();
    // A shipping order has no shop, so a shop-scoped code can't apply.
    expect(await validateDiscount("SOLOCENTRO", 5000, {})).toBeNull();
  });
});

describe("usage ledger", () => {
  it("records who used the code and on what", async () => {
    await makeCode("TRACCIA");
    await recordDiscountUseByCode("TRACCIA", {
      orderId: "ord-x",
      userId: customerId,
      email: EMAIL,
      amountCents: 500,
    });
    const uses = await getDiscountUses("TRACCIA");
    expect(uses).toHaveLength(1);
    expect(uses[0].redemption).toMatchObject({
      orderId: "ord-x",
      userId: customerId,
      email: EMAIL,
      amountCents: 500,
    });
  });
});
