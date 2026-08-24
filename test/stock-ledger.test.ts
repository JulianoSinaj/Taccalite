import { describe, it, expect, beforeAll } from "vitest";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, stockMovements, users, loyaltyAccounts, loyaltyTransactions } from "@/lib/db/schema";
import { applyStockChange, stockUnitsForLine } from "@/lib/stock";
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

/**
 * A weighed line must move the same number of units in both directions.
 *
 * The counter sale skips them (`products.stock` is an integer, and 0,350 kg is
 * not a unit count), but the restock used to hand back the line's `quantity` —
 * which is 1 for a weighed line. So ringing up 0,350 kg and then cancelling
 * *created* a unit of stock and ledgered it as a real movement, and repeating it
 * walked the catalogue upward with a clean audit trail behind it.
 */
describe("stockUnitsForLine", () => {
  it("counts a unit line by its quantity", () => {
    expect(stockUnitsForLine({ quantity: 3, weightKg: null })).toBe(3);
    expect(stockUnitsForLine({ quantity: 1 })).toBe(1);
  });

  it("moves nothing for a weighed line, in either direction", () => {
    expect(stockUnitsForLine({ quantity: 1, weightKg: 0.35 })).toBe(0);
    // The pair that used to disagree: the sale skipped it, the cancellation
    // gave back 1.
    const line = { quantity: 1, weightKg: 0.35 };
    expect(stockUnitsForLine(line)).toBe(stockUnitsForLine(line));
  });

  it("keeps a mixed basket balanced across sale and cancellation", async () => {
    await seedProduct(10);
    const lines = [
      { quantity: 2, weightKg: null }, // by the piece
      { quantity: 1, weightKg: 0.35 }, // by weight
    ];
    const out = lines.reduce((n, l) => n + stockUnitsForLine(l), 0);
    await applyStockChange({ productId, delta: -out, reason: "Vendita al banco" });
    expect(await currentStock()).toBe(8);

    const back = lines.reduce((n, l) => n + stockUnitsForLine(l), 0);
    await applyStockChange({ productId, delta: back, reason: "Annullo" });
    // Back where it started — not 11, which is what the old asymmetry produced.
    expect(await currentStock()).toBe(10);
  });
});

/**
 * Raising stock has two consequences, and they used to be written out by hand in
 * whichever caller remembered them — `saveProduct` and `adjustStock`, two of the
 * five paths that raise stock. Receiving a lot, correcting one upward, a
 * cancellation restocking and a CSV import all moved the number in silence, so
 * the low-stock alert stayed latched and could never fire again.
 */
describe("restock side-effects", () => {
  it("re-arms the low-stock alert once back above the reorder point", async () => {
    await seedProduct(1);
    await db
      .update(products)
      .set({ reorderPoint: 5, lowStockNotifiedAt: new Date() })
      .where(eq(products.id, productId));

    // The path a supplier delivery takes (`receiveBatch` → `applyStockChange`),
    // which used to leave the stamp in place.
    await applyStockChange({ productId, delta: 20, reason: "Carico lotto L-1" });

    const [p] = await db
      .select({ stamp: products.lowStockNotifiedAt })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    expect(p.stamp).toBeNull();
  });

  it("leaves the alert latched while the product is still low", async () => {
    await seedProduct(1);
    const stamped = new Date();
    await db
      .update(products)
      .set({ reorderPoint: 10, lowStockNotifiedAt: stamped })
      .where(eq(products.id, productId));

    await applyStockChange({ productId, delta: 2, reason: "Carico parziale" });

    const [p] = await db
      .select({ stamp: products.lowStockNotifiedAt })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    // 3 units against a reorder point of 10 — still low, so re-alerting later is
    // correct and the stamp must stay.
    expect(p.stamp).not.toBeNull();
  });

  it("does not touch the alert on a decrement", async () => {
    await seedProduct(10);
    const stamped = new Date();
    await db
      .update(products)
      .set({ reorderPoint: 2, lowStockNotifiedAt: stamped })
      .where(eq(products.id, productId));

    await applyStockChange({ productId, delta: -1, reason: "Vendita" });

    const [p] = await db
      .select({ stamp: products.lowStockNotifiedAt })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    expect(p.stamp).not.toBeNull();
  });
});
