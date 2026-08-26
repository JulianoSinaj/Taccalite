import { describe, it, expect, beforeAll, vi } from "vitest";

// The redemption action writes a session cookie and revalidates routes, both of
// which want Next's request scope. Stub them so the guard can be exercised here.
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

import { and, eq, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loyaltyAccounts, loyaltyTransactions, orders, redemptions, shops, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginUser } from "@/lib/auth/service";
import { addPoints, getOrCreateLoyaltyAccount, reversePointsForOrder } from "@/lib/loyalty";
import { recordRefund } from "@/lib/orders";
import { updateRedemptionStatus } from "@/lib/admin/actions";

/**
 * Two money-equivalent invariants of the loyalty scheme:
 *
 *  - a refund takes back the points the order earned, in proportion, exactly
 *    once — however many times the refund is recorded, and never below zero;
 *  - a cancelled redemption is terminal: the points went back to the customer,
 *    so it can't be flipped to "consegnato" for a reward *and* a refund.
 */

const SHOP = "refund-shop";
let seq = 0;

async function makeCustomer() {
  const [u] = await db
    .insert(users)
    .values({
      username: `refund-cust-${Date.now()}-${++seq}`,
      name: "Cliente Rimborso",
      passwordHash: hashPassword("Password!234"),
      role: "customer",
    })
    .returning({ id: users.id });
  await getOrCreateLoyaltyAccount(u.id);
  return u.id;
}

async function makePaidOrder(userId: string, totalCents: number) {
  const orderNumber = `RF-${Date.now()}-${++seq}`;
  const [row] = await db
    .insert(orders)
    .values({
      orderNumber,
      userId,
      email: "cliente@example.com",
      name: "Cliente",
      fulfilment: "pickup",
      shopSlug: SHOP,
      subtotalCents: totalCents,
      totalCents,
      status: "paid",
      paymentStatus: "paid",
      paymentMethod: "card",
      paidAt: new Date(),
    })
    .returning({ id: orders.id });
  return { id: row.id, orderNumber };
}

const balance = async (userId: string) =>
  (await db.select({ points: loyaltyAccounts.points }).from(loyaltyAccounts).where(eq(loyaltyAccounts.userId, userId)))[0]
    .points;

const reversals = (userId: string) =>
  db
    .select()
    .from(loyaltyTransactions)
    .where(and(eq(loyaltyTransactions.userId, userId), like(loyaltyTransactions.reason, "Rimborso ordine %")));

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Rimborsi", specialty: "Test" })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(users)
    .values({
      username: "refund-admin",
      email: "refund-admin@example.com",
      name: "Admin",
      passwordHash: hashPassword("Password!234"),
      role: "admin",
    })
    .onConflictDoNothing({ target: users.username });
  const res = await loginUser({ identifier: "refund-admin", password: "Password!234" });
  expect(res.ok).toBe(true);
});

describe("refunding an order takes its points back", () => {
  it("reverses in proportion, converges on repeat, and stops at the full amount", async () => {
    const userId = await makeCustomer();
    const { orderNumber } = await makePaidOrder(userId, 2000);
    await addPoints(userId, 20, `Ordine ${orderNumber}`);

    // Half the money back → half the points back.
    await reversePointsForOrder(userId, orderNumber, 1000, 2000);
    expect(await balance(userId)).toBe(10);

    // Recording the same cumulative refund again (webhook + action) adds nothing.
    await reversePointsForOrder(userId, orderNumber, 1000, 2000);
    expect(await balance(userId)).toBe(10);
    expect(await reversals(userId)).toHaveLength(1);

    // The rest of the money → the rest of the points, and no more than earned.
    await reversePointsForOrder(userId, orderNumber, 2000, 2000);
    await reversePointsForOrder(userId, orderNumber, 2000, 2000);
    expect(await balance(userId)).toBe(0);
    const rows = await reversals(userId);
    expect(rows).toHaveLength(2);
    expect(rows.reduce((s, r) => s + r.delta, 0)).toBe(-20);
  });

  it("cannot take back points the customer has already spent", async () => {
    const userId = await makeCustomer();
    const { orderNumber } = await makePaidOrder(userId, 2000);
    await addPoints(userId, 20, `Ordine ${orderNumber}`);
    await addPoints(userId, -15, "Riscatto: Caffè");

    await reversePointsForOrder(userId, orderNumber, 2000, 2000);
    expect(await balance(userId)).toBe(0);
    // Only what was left could go; no zero-delta noise rows either.
    const rows = await reversals(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(-5);

    await reversePointsForOrder(userId, orderNumber, 2000, 2000);
    expect(await reversals(userId)).toHaveLength(1);
  });

  it("ignores an order that never earned anything", async () => {
    const userId = await makeCustomer();
    await addPoints(userId, 30, "Bonus benvenuto");
    await reversePointsForOrder(userId, "RF-nothing", 1000, 1000);
    expect(await balance(userId)).toBe(30);
    expect(await reversals(userId)).toHaveLength(0);
  });

  it("is wired into recordRefund", async () => {
    const userId = await makeCustomer();
    const { id, orderNumber } = await makePaidOrder(userId, 4000);
    await addPoints(userId, 40, `Vendita al banco ${orderNumber}`);

    const partial = await recordRefund(id, 1000, { reason: "test" });
    expect(partial?.full).toBe(false);
    expect(await balance(userId)).toBe(30);

    const full = await recordRefund(id, 4000, { reason: "test" });
    expect(full?.full).toBe(true);
    expect(await balance(userId)).toBe(0);
  });
});

describe("a cancelled redemption is terminal", () => {
  it("refuses to reopen it, and leaves the balance alone", async () => {
    const userId = await makeCustomer();
    await addPoints(userId, 50, "Bonus");
    const [r] = await db
      .insert(redemptions)
      .values({ userId, rewardId: "rw-test", rewardName: "Tazza", pointsSpent: 50, status: "cancelled" })
      .returning({ id: redemptions.id });

    for (const status of ["pending", "fulfilled"]) {
      const res = await updateRedemptionStatus({ status: "idle" }, form({ id: r.id, status }));
      expect(res.status).toBe("error");
      expect(res.message).toMatch(/annullato non si può riaprire/);
    }
    const [after] = await db.select().from(redemptions).where(eq(redemptions.id, r.id));
    expect(after.status).toBe("cancelled");
    expect(await balance(userId)).toBe(50);
  });
});
