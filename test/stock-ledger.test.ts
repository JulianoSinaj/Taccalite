import { describe, it, expect, beforeAll } from "vitest";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, stockMovements, users, loyaltyAccounts, loyaltyTransactions } from "@/lib/db/schema";
import { applyStockChange } from "@/lib/stock";
import { anonymizeUser } from "@/lib/gdpr";
import { addPointsForPurchase, getOrCreateLoyaltyAccount, addPoints } from "@/lib/loyalty";
import { hashPasswordAsync } from "@/lib/auth/password";

/**
 * The two ledger invariants that a UI test can't see:
 *
 *  - a stock movement records the delta ACTUALLY applied, so the movement
 *    history always sums to the on-hand balance even when a request was clamped
 *    at the zero floor;
 *  - GDPR erasure retires the loyalty card, so an erased customer's card can't
 *    keep earning points nobody can spend.
 */

const SHOP = "ledger-shop";
const PRODUCT = "ledger-prod";

let productId = "";

async function seedProduct(stock: number) {
  await db.update(products).set({ stock }).where(eq(products.id, productId));
  await db.delete(stockMovements).where(eq(stockMovements.productId, productId));
}

const movements = () =>
  db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.createdAt));

const currentStock = async () =>
  (await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId)).limit(1))[0]
    .stock;

beforeAll(async () => {
  await db.insert(shops).values({ slug: SHOP, name: "Sede ledger", specialty: "test" }).onConflictDoNothing();
  await db
    .insert(products)
    .values({ slug: PRODUCT, name: "Prodotto ledger", shopSlug: SHOP, priceCents: 500, stock: 10 })
    .onConflictDoNothing();
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.slug, PRODUCT)).limit(1);
  productId = p.id;
});

describe("applyStockChange", () => {
  it("ledgers an ordinary decrement and moves the balance", async () => {
    await seedProduct(10);
    const change = await applyStockChange({ productId, delta: -3, reason: "Vendita" });
    expect(change).toMatchObject({ applied: -3, stockAfter: 7, stockBefore: 10, clamped: false });
    expect(await currentStock()).toBe(7);
    const [m] = await movements();
    expect(m.delta).toBe(-3);
    expect(m.stockAfter).toBe(7);
  });

  it("records the APPLIED delta when clamped at zero, so the ledger still sums", async () => {
    await seedProduct(2);
    // Ask for 5 from a shelf holding 2 — an oversell the counter can physically
    // do. Recording the requested −5 against stockAfter 0 was the bug.
    const change = await applyStockChange({ productId, delta: -5, reason: "Vendita al banco" });
    expect(change).toMatchObject({ applied: -2, stockAfter: 0, clamped: true });

    const rows = await movements();
    const sum = rows.reduce((s, m) => s + m.delta, 0);
    expect(sum).toBe(-2);
    expect(2 + sum).toBe(await currentStock());
  });

  it("keeps the ledger summing to the balance across a mixed sequence", async () => {
    await seedProduct(5);
    await applyStockChange({ productId, delta: +20, reason: "Carico" });
    await applyStockChange({ productId, delta: -7, reason: "Vendita" });
    await applyStockChange({ productId, delta: -100, reason: "Scarico eccessivo" }); // clamps
    await applyStockChange({ productId, delta: +4, reason: "Reso" });

    const rows = await movements();
    const sum = rows.reduce((s, m) => s + m.delta, 0);
    expect(5 + sum).toBe(await currentStock());
    // Every row's stockAfter is a real snapshot, never a clamped mismatch.
    for (const m of rows) expect(m.stockAfter).toBeGreaterThanOrEqual(0);
  });

  it("writes no movement for a no-op", async () => {
    await seedProduct(4);
    const change = await applyStockChange({ productId, delta: -0, reason: "niente" });
    expect(change?.applied).toBe(0);
    expect(await movements()).toHaveLength(0);
  });

  it("sets an absolute figure for a stocktake, ledgering the difference", async () => {
    await seedProduct(9);
    const change = await applyStockChange({ productId, delta: 0, setTo: 6, reason: "Conteggio" });
    expect(change).toMatchObject({ applied: -3, stockAfter: 6, stockBefore: 9 });
    const [m] = await movements();
    expect(m.delta).toBe(-3);
    expect(m.reason).toBe("Conteggio");
  });

  it("returns null for a product that doesn't track stock", async () => {
    await db.update(products).set({ stock: null }).where(eq(products.id, productId));
    expect(await applyStockChange({ productId, delta: -1, reason: "x" })).toBeNull();
    await db.update(products).set({ stock: 10 }).where(eq(products.id, productId));
  });
});

describe("anonymizeUser — loyalty", () => {
  it("retires the card and zeroes the balance, so it can no longer accrue", async () => {
    const [user] = await db
      .insert(users)
      .values({
        username: `gdpr-${Date.now()}`,
        name: "Da Rimuovere",
        email: `gdpr-${Date.now()}@example.com`,
        passwordHash: await hashPasswordAsync("password123"),
        role: "customer",
      })
      .returning({ id: users.id });

    const account = await getOrCreateLoyaltyAccount(user.id);
    await addPoints(user.id, 250, "Bonus");
    const card = account.cardNumber;

    // Before erasure the card earns points.
    expect(await addPointsForPurchase(card, 10, user.id)).toMatchObject({ ok: true });

    await anonymizeUser(user.id);

    const [after] = await db
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.userId, user.id))
      .limit(1);
    expect(after.points).toBe(0);
    expect(after.cardNumber).not.toBe(card);

    // The old card is gone, and the new one belongs to a deactivated account.
    expect(await addPointsForPurchase(card, 10, user.id)).toMatchObject({ ok: false });
    expect(await addPointsForPurchase(after.cardNumber, 10, user.id)).toMatchObject({
      ok: false,
      error: expect.stringContaining("disattivato"),
    });

    // Ledger rows survive as business records but carry no free text.
    const tx = await db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.userId, user.id));
    expect(tx.length).toBeGreaterThan(0);
    expect(tx.every((t) => t.reason === "Dati rimossi")).toBe(true);
  });
});
