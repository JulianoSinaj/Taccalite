import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

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

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { productBatches, products, shops, stockMovements, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginUser } from "@/lib/auth/service";
import { consumeBatchesFefo, restoreBatches, setProductStock } from "@/lib/stock";
import { receiveBatch, writeOffBatch, correctBatchRemaining } from "@/lib/admin/batch-actions";

/**
 * Lots and expiry — the HACCP half of inventory, which had no test at all.
 *
 * `stock-ledger.test.ts` covers the flat on-hand figure. This covers how that
 * figure is *made up*: which lot a sale is attributed to, what happens to a lot
 * that is past its date, and whether a lot and the on-hand it belongs to can
 * ever part company.
 */

const SHOP = "batch-shop";
const idle = { status: "idle" as const };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

let productId = "";

const stockNow = async () =>
  (await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId)))[0]!.stock;

const lots = () =>
  db
    .select()
    .from(productBatches)
    .where(eq(productBatches.productId, productId))
    .orderBy(asc(productBatches.lotCode));

const movements = () =>
  db.select().from(stockMovements).where(eq(stockMovements.productId, productId));

/** Insert a lot directly, bypassing the action, to set up a starting state. */
async function seedLot(lotCode: string, expiryDate: string | null, quantity: number) {
  await db.insert(productBatches).values({
    productId,
    lotCode,
    expiryDate,
    quantity,
    remaining: quantity,
    receivedAt: new Date(),
  });
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Sede lotti", specialty: "test" })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(users)
    .values({
      username: "batch-admin",
      email: "batch-admin@example.com",
      name: "Admin",
      passwordHash: hashPassword("Password!234"),
      role: "admin",
    })
    .onConflictDoNothing({ target: users.username });
  expect((await loginUser({ identifier: "batch-admin", password: "Password!234" })).ok).toBe(true);
});

beforeEach(async () => {
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, "batch-prod"));
  for (const p of existing) {
    await db.delete(productBatches).where(eq(productBatches.productId, p.id));
    await db.delete(stockMovements).where(eq(stockMovements.productId, p.id));
  }
  await db.delete(products).where(eq(products.slug, "batch-prod"));
  const [row] = await db
    .insert(products)
    .values({ slug: "batch-prod", name: "Ciauscolo", shopSlug: SHOP, priceCents: 500, stock: 0 })
    .returning({ id: products.id });
  productId = row!.id;
});

// ── FEFO ─────────────────────────────────────────────────────────────────────

describe("consumeBatchesFefo", () => {
  it("takes the earliest expiry first", async () => {
    await seedLot("A", "2026-12-01", 5);
    await seedLot("B", "2026-10-01", 5);

    const taken = await consumeBatchesFefo(productId, 6, "2026-09-01");

    expect(taken.map((t) => [t.lotCode, t.taken])).toEqual([
      ["B", 5],
      ["A", 1],
    ]);
  });

  it("leaves an expired lot alone instead of quietly draining it", async () => {
    // The defect this exists for: sorting by expiry ascending made an *already
    // expired* lot the very first thing a sale was attributed to, and
    // /admin/products/scadenze only lists lots with units left — so the lot
    // drained to zero through ordinary sales and disappeared off the one report
    // whose job is to say "throw this away".
    await seedLot("SCADUTO", "2026-08-01", 5);
    await seedLot("BUONO", "2026-12-01", 5);

    const taken = await consumeBatchesFefo(productId, 3, "2026-09-01");

    expect(taken.map((t) => t.lotCode)).toEqual(["BUONO"]);
    const rows = await lots();
    // Still sitting there, still on the report, still demanding a decision.
    expect(rows.find((r) => r.lotCode === "SCADUTO")!.remaining).toBe(5);
  });

  it("takes nothing when every lot is expired, rather than the wrong thing", async () => {
    await seedLot("SCADUTO", "2026-08-01", 5);
    expect(await consumeBatchesFefo(productId, 2, "2026-09-01")).toEqual([]);
  });

  it("puts an undated lot last, after everything with a date", async () => {
    await seedLot("DATATO", "2026-12-01", 2);
    await seedLot("SENZADATA", null, 5);

    const taken = await consumeBatchesFefo(productId, 4, "2026-09-01");
    expect(taken.map((t) => t.lotCode)).toEqual(["DATATO", "SENZADATA"]);
  });
});

describe("restoreBatches", () => {
  it("puts units back in the reverse of the order they came out", async () => {
    // Consumption is earliest-expiry-first with undated lots *last*, so undoing
    // it has to start with the undated ones. Coalescing null to "" sorted them
    // last in both directions, which put a return in the wrong lot.
    await seedLot("DATATO", "2026-12-01", 5);
    await seedLot("SENZADATA", null, 5);
    await consumeBatchesFefo(productId, 7, "2026-09-01"); // 5 dated + 2 undated

    await restoreBatches(productId, 2);

    const rows = await lots();
    expect(rows.find((r) => r.lotCode === "SENZADATA")!.remaining).toBe(5);
    expect(rows.find((r) => r.lotCode === "DATATO")!.remaining).toBe(0);
  });

  it("never puts back more than a lot originally held", async () => {
    await seedLot("A", "2026-12-01", 3);
    await consumeBatchesFefo(productId, 3, "2026-09-01");
    await restoreBatches(productId, 10);
    expect((await lots())[0]!.remaining).toBe(3);
  });
});

// ── the lot actions ──────────────────────────────────────────────────────────

describe("receiveBatch", () => {
  it("records the lot and loads its units through the ledger, together", async () => {
    const res = await receiveBatch(
      idle,
      form({ productId, lotCode: "L1", expiryDate: "2026-12-01", quantity: "12" }),
    );
    expect(res.status).toBe("success");

    expect(await stockNow()).toBe(12);
    const rows = await lots();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.remaining).toBe(12);
    // The lot row and the movement are one event now, not two transactions.
    const moves = await movements();
    expect(moves).toHaveLength(1);
    expect(moves[0]!.delta).toBe(12);
  });

  it("refuses a product that doesn't track stock", async () => {
    await db.update(products).set({ stock: null }).where(eq(products.id, productId));
    const res = await receiveBatch(idle, form({ productId, lotCode: "L1", quantity: "5" }));
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/non traccia le scorte/);
    expect(await lots()).toHaveLength(0);
  });
});

describe("writeOffBatch", () => {
  it("removes the remaining units from the lot and the shelf together", async () => {
    await receiveBatch(idle, form({ productId, lotCode: "L1", quantity: "8" }));
    const [lot] = await lots();

    const res = await writeOffBatch(idle, form({ id: lot!.id, reason: "Scaduto" }));
    expect(res.status).toBe("success");

    expect(await stockNow()).toBe(0);
    expect((await lots())[0]!.remaining).toBe(0);
    expect((await movements()).map((m) => m.delta)).toEqual([8, -8]);
  });

  it("refuses once the product has stopped tracking stock", async () => {
    // Previously this emptied the lot, moved no stock because
    // `applyStockChange` returns null for an untracked product, and reported
    // success — the lot records and the on-hand figure parting company in
    // silence.
    await receiveBatch(idle, form({ productId, lotCode: "L1", quantity: "8" }));
    const [lot] = await lots();
    await db.update(products).set({ stock: null }).where(eq(products.id, productId));

    const res = await writeOffBatch(idle, form({ id: lot!.id }));
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/non traccia le scorte/);
    expect((await lots())[0]!.remaining).toBe(8);
  });
});

describe("correctBatchRemaining", () => {
  it("moves the shelf by the same amount it moves the lot", async () => {
    await receiveBatch(idle, form({ productId, lotCode: "L1", quantity: "10" }));
    const [lot] = await lots();

    const res = await correctBatchRemaining(idle, form({ id: lot!.id, remaining: "7" }));
    expect(res.status).toBe("success");

    expect(await stockNow()).toBe(7);
    expect((await lots())[0]!.remaining).toBe(7);
  });

  it("refuses more than the lot ever contained", async () => {
    await receiveBatch(idle, form({ productId, lotCode: "L1", quantity: "10" }));
    const [lot] = await lots();
    const res = await correctBatchRemaining(idle, form({ id: lot!.id, remaining: "12" }));
    expect(res.status).toBe("error");
    expect(await stockNow()).toBe(10);
  });

  it("refuses once the product has stopped tracking stock", async () => {
    await receiveBatch(idle, form({ productId, lotCode: "L1", quantity: "10" }));
    const [lot] = await lots();
    await db.update(products).set({ stock: null }).where(eq(products.id, productId));

    const res = await correctBatchRemaining(idle, form({ id: lot!.id, remaining: "3" }));
    expect(res.status).toBe("error");
    expect((await lots())[0]!.remaining).toBe(10);
  });
});

// ── the two halves cannot be separated ───────────────────────────────────────

describe("setProductStock and open lots", () => {
  it("refuses to switch a product to made-to-order while lots still hold units", async () => {
    // Made-to-order means "don't count units". Lots would go on claiming some,
    // and would never reappear on the expiry report, which only lists what is
    // still on hand. Refused rather than silently zeroed — the same choice this
    // codebase makes for a category still in use.
    await receiveBatch(idle, form({ productId, lotCode: "L1", quantity: "6" }));

    await expect(
      setProductStock({ productId, from: 6, to: null, reason: "Test" }),
    ).rejects.toThrow(/lotto|lotti/);

    expect(await stockNow()).toBe(6);
  });

  it("allows it once the lots are empty", async () => {
    await receiveBatch(idle, form({ productId, lotCode: "L1", quantity: "6" }));
    const [lot] = await lots();
    await writeOffBatch(idle, form({ id: lot!.id, reason: "Scaduto" }));

    await setProductStock({ productId, from: 0, to: null, reason: "Test" });
    expect(await stockNow()).toBeNull();
  });
});
