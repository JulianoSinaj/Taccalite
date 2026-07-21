import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  shops,
  products,
  users,
  rewards,
  settings,
  orders,
  orderItems,
  loyaltyAccounts,
  loyaltyTransactions,
  redemptions,
  emailOutbox,
} from "@/lib/db/schema";
import { createOrder, finalizeOrder } from "@/lib/orders";
import { addPoints, redeemReward, getOrCreateLoyaltyAccount } from "@/lib/loyalty";
import type { CheckoutInput } from "@/lib/validation/order";

// Fixed ids so tests can reference the seeded rows deterministically.
const USER_ID = "test-user-1";
const REWARD_ID = "test-reward-100";

// Base checkout payload (server ignores any client-supplied price).
function checkout(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    items: [{ slug: "porchetta", quantity: 1 }],
    name: "Mario Rossi",
    email: "mario@example.com",
    fulfilment: "pickup",
    shopSlug: "centro",
    ...overrides,
  } as CheckoutInput;
}

beforeAll(async () => {
  // Shop (store enabled) — only slug/name/specialty are NOT NULL without a default.
  await db
    .insert(shops)
    .values({ slug: "centro", name: "Taccalite Centro", specialty: "Porchetta", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });

  // A second, store-DISABLED shop to exercise the pickup guard.
  await db
    .insert(shops)
    .values({ slug: "chiuso", name: "Taccalite Chiuso", specialty: "Porchetta", storeEnabled: false })
    .onConflictDoNothing({ target: shops.slug });

  // Two purchasable + active products with known prices.
  await db
    .insert(products)
    .values([
      {
        slug: "porchetta",
        name: "Porchetta",
        shopSlug: "centro",
        priceCents: 1900,
        unit: "kg",
        purchasable: true,
        active: true,
      },
      {
        slug: "ciauscolo",
        name: "Ciauscolo",
        shopSlug: "centro",
        priceCents: 450,
        unit: "pezzo",
        purchasable: true,
        active: true,
      },
    ])
    .onConflictDoNothing({ target: products.slug });

  // Loyalty rate: 1 point per euro.
  await db
    .insert(settings)
    .values({ key: "loyalty.pointsPerEuro", value: 1 })
    .onConflictDoNothing({ target: settings.key });

  // A customer.
  await db
    .insert(users)
    .values({
      id: USER_ID,
      username: "mario",
      email: "mario@example.com",
      name: "Mario Rossi",
      passwordHash: "x",
      role: "customer",
    })
    .onConflictDoNothing({ target: users.id });

  // An active reward costing 100 points.
  await db
    .insert(rewards)
    .values({ id: REWARD_ID, slug: "sconto-10", name: "Sconto 10%", points: 100, active: true })
    .onConflictDoNothing({ target: rewards.id });
});

beforeEach(async () => {
  // Clean the mutable tables so each test is independent; keep seeded fixtures.
  // order_items cascades from orders, but delete explicitly for clarity/safety.
  await db.delete(orderItems);
  await db.delete(orders);
  await db.delete(loyaltyTransactions);
  await db.delete(redemptions);
  await db.delete(loyaltyAccounts);
  await db.delete(emailOutbox);
});

describe("createOrder — server-authoritative pricing", () => {
  it("prices from the DB (ignoring client prices), sums totals, adds no shipping on pickup, and persists rows", async () => {
    const input = checkout({
      items: [
        // Client-supplied price fields are intentionally bogus; they must be ignored.
        { slug: "porchetta", quantity: 2, priceCents: 1 } as never,
        { slug: "ciauscolo", quantity: 3, priceCents: 999999 } as never,
      ],
    });

    const created = await createOrder(input, USER_ID);

    // subtotal = 1900*2 + 450*3 = 3800 + 1350 = 5150; pickup => no shipping.
    expect(created.totalCents).toBe(5150);
    expect(created.orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/);

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, created.orderId));
    expect(orderRow).toBeTruthy();
    expect(orderRow.subtotalCents).toBe(5150);
    expect(orderRow.shippingCents).toBe(0);
    expect(orderRow.totalCents).toBe(5150);
    expect(orderRow.fulfilment).toBe("pickup");
    expect(orderRow.status).toBe("pending");

    const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, created.orderId));
    expect(itemRows).toHaveLength(2);
    const porchetta = itemRows.find((i) => i.productSlug === "porchetta")!;
    expect(porchetta.unitPriceCents).toBe(1900);
    expect(porchetta.quantity).toBe(2);
    expect(porchetta.lineTotalCents).toBe(3800);
    const ciauscolo = itemRows.find((i) => i.productSlug === "ciauscolo")!;
    expect(ciauscolo.unitPriceCents).toBe(450);
    expect(ciauscolo.lineTotalCents).toBe(1350);
  });

  it("adds the flat 700c shipping fee when fulfilment is shipping", async () => {
    const created = await createOrder(
      checkout({
        fulfilment: "shipping",
        shopSlug: undefined,
        address: "Via Roma 1",
        city: "Ascoli",
        zip: "63100",
        items: [{ slug: "ciauscolo", quantity: 1 }],
      }),
    );

    // subtotal = 450, shipping = 700 => total 1150.
    expect(created.totalCents).toBe(1150);
    const [orderRow] = await db.select().from(orders).where(eq(orders.id, created.orderId));
    expect(orderRow.shippingCents).toBe(700);
    expect(orderRow.subtotalCents).toBe(450);
    expect(orderRow.totalCents).toBe(1150);
    expect(orderRow.fulfilment).toBe("shipping");
  });

  it("throws on pickup at a non-existent shop", async () => {
    await expect(createOrder(checkout({ shopSlug: "does-not-exist" }))).rejects.toThrow();
  });

  it("throws on pickup at a store-disabled shop", async () => {
    await expect(createOrder(checkout({ shopSlug: "chiuso" }))).rejects.toThrow();
  });
});

describe("finalizeOrder — idempotent paid flip + single loyalty accrual", () => {
  it("marks paid once and accrues loyalty exactly once when called twice", async () => {
    const created = await createOrder(checkout({ items: [{ slug: "porchetta", quantity: 1 }] }), USER_ID);

    await finalizeOrder(created.orderId);
    await finalizeOrder(created.orderId); // second call must be a no-op

    const [orderRow] = await db.select().from(orders).where(eq(orders.id, created.orderId));
    expect(orderRow.status).toBe("paid");
    expect(orderRow.paymentStatus).toBe("paid");

    // subtotal 1900 => floor(1900/100 * 1) = 19 points, credited once.
    const txns = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.userId, USER_ID));
    expect(txns).toHaveLength(1);
    expect(txns[0].delta).toBe(19);

    const account = await getOrCreateLoyaltyAccount(USER_ID);
    expect(account.points).toBe(19);
  });

  it("does not accrue loyalty for guest (no userId) orders", async () => {
    const created = await createOrder(checkout({ items: [{ slug: "porchetta", quantity: 1 }] }));
    await finalizeOrder(created.orderId);

    const txns = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.userId, USER_ID));
    expect(txns).toHaveLength(0);
  });
});

describe("addPoints — credit/debit ledger", () => {
  it("credits points and records a ledger entry", async () => {
    const { points } = await addPoints(USER_ID, 50, "Test credit");
    expect(points).toBe(50);

    const txns = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.userId, USER_ID));
    expect(txns).toHaveLength(1);
    expect(txns[0].delta).toBe(50);
    expect(txns[0].balanceAfter).toBe(50);
  });

  it("never lets the balance go below 0 on an over-debit", async () => {
    await addPoints(USER_ID, 50, "seed");
    const { points } = await addPoints(USER_ID, -100, "over-debit");
    expect(points).toBe(0);

    const account = await getOrCreateLoyaltyAccount(USER_ID);
    expect(account.points).toBe(0);

    const txns = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.userId, USER_ID));
    // Ledger records the debit with a clamped balanceAfter of 0.
    const last = txns[txns.length - 1];
    expect(last.delta).toBe(-100);
    expect(last.balanceAfter).toBe(0);
  });
});

describe("redeemReward", () => {
  it("succeeds when points suffice: debits points and creates a redemption row", async () => {
    await addPoints(USER_ID, 100, "seed for redeem");

    const result = await redeemReward(USER_ID, REWARD_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pointsLeft).toBe(0);
      expect(result.reference).toBeTruthy();
    }

    const account = await getOrCreateLoyaltyAccount(USER_ID);
    expect(account.points).toBe(0);

    const reds = await db.select().from(redemptions).where(eq(redemptions.userId, USER_ID));
    expect(reds).toHaveLength(1);
    expect(reds[0].pointsSpent).toBe(100);
    expect(reds[0].rewardId).toBe(REWARD_ID);
  });

  it("fails with {ok:false} and leaves points unchanged when points are insufficient", async () => {
    await addPoints(USER_ID, 50, "not enough");

    const result = await redeemReward(USER_ID, REWARD_ID);
    expect(result.ok).toBe(false);

    const account = await getOrCreateLoyaltyAccount(USER_ID);
    expect(account.points).toBe(50); // unchanged — rolled back

    const reds = await db.select().from(redemptions).where(eq(redemptions.userId, USER_ID));
    expect(reds).toHaveLength(0);
  });
});
