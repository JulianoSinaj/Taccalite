import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, shops, stockMovements } from "@/lib/db/schema";
import { getStockDivergences } from "@/lib/admin/queries";
import { applyStockChange } from "@/lib/stock";

/**
 * The ledger's whole promise is that the history explains the balance, and
 * nothing ever checked it.
 *
 * `applyOrderStock` claims its transition *before* doing the work, so a failure
 * part-way through a multi-product order leaves some products decremented and
 * some not — permanently, because the claim prevents a retry. Since the system 2
 * audit that is logged; it was still only findable by reading logs. Anything
 * else that writes `products.stock` outside `lib/stock.ts` would drift the same
 * way and just as quietly.
 */

const SHOP = "recon-shop";
const A = "recon-a";
const B = "recon-b";

const idOf = async (slug: string) =>
  (await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)))[0]!.id;

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Sede riconciliazione", specialty: "test" })
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  for (const slug of [A, B]) {
    const rows = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
    for (const r of rows) await db.delete(stockMovements).where(eq(stockMovements.productId, r.id));
    await db.delete(products).where(eq(products.slug, slug));
  }
  await db.insert(products).values([
    { slug: A, name: "Prodotto A", shopSlug: SHOP, priceCents: 100, stock: 0 },
    { slug: B, name: "Prodotto B", shopSlug: SHOP, priceCents: 100, stock: 0 },
  ]);
});

/**
 * Only the products this suite owns.
 *
 * The database is shared across suites and several of them seed a product by
 * writing `products.stock` directly — which is a genuine divergence, correctly
 * reported. Filtering by name was not enough (three suites use "Prodotto"), so
 * this filters on the two ids created above.
 */
const mine = async (scope: string | null = null) => {
  const ours = new Set([await idOf(A), await idOf(B)]);
  return (await getStockDivergences(scope)).filter((d) => ours.has(d.id));
};

describe("getStockDivergences", () => {
  it("says nothing when every movement adds up", async () => {
    const a = await idOf(A);
    await applyStockChange({ productId: a, delta: 12, reason: "Carico" });
    await applyStockChange({ productId: a, delta: -5, reason: "Vendita" });

    expect(await mine()).toEqual([]);
  });

  it("catches a shelf figure written behind the ledger's back", async () => {
    const a = await idOf(A);
    await applyStockChange({ productId: a, delta: 10, reason: "Carico" });
    // Exactly what a half-applied order, or any write outside lib/stock.ts,
    // leaves behind: the balance moved and the history did not.
    await db.update(products).set({ stock: 3 }).where(eq(products.id, a));

    const found = await mine();
    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe("Prodotto A");
    expect(found[0]!.onHand).toBe(3);
    expect(Number(found[0]!.ledger)).toBe(10);
  });

  it("catches a movement written with no matching balance", async () => {
    const b = await idOf(B);
    await db.insert(stockMovements).values({ productId: b, delta: 7, reason: "Orfano", stockAfter: 7 });

    const found = await mine();
    expect(found.map((d) => d.name)).toEqual(["Prodotto B"]);
  });

  it("ignores a made-to-order product, which has no quantity to reconcile", async () => {
    const a = await idOf(A);
    await applyStockChange({ productId: a, delta: 4, reason: "Carico" });
    await db.update(products).set({ stock: null }).where(eq(products.id, a));

    expect(await mine()).toEqual([]);
  });

  it("ignores an archived product", async () => {
    const a = await idOf(A);
    await applyStockChange({ productId: a, delta: 9, reason: "Carico" });
    await db.update(products).set({ stock: 1, archivedAt: new Date() }).where(eq(products.id, a));

    expect(await mine()).toEqual([]);
  });

  it("is bound by the operator's sede, like every other list", async () => {
    const a = await idOf(A);
    await applyStockChange({ productId: a, delta: 10, reason: "Carico" });
    await db.update(products).set({ stock: 3 }).where(eq(products.id, a));

    expect(await mine(SHOP)).toHaveLength(1);
    expect(await mine("un-altra-sede")).toEqual([]);
  });
});
