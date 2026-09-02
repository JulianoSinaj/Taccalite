import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";

/**
 * Contended writes must not surface as a driver error.
 *
 * `PRAGMA busy_timeout = 5000` is applied at boot and applies to that
 * connection only. The libSQL sqlite3 driver hands each `transaction()` the
 * current connection and drops its reference, so the next caller lazily opens a
 * fresh one — whose busy timeout is 0. Every transaction after the first
 * therefore had no timeout at all, and any contention failed instantly: a raw
 * SQLITE_BUSY thrown out of a checkout, a stock movement, a points debit or a
 * coupon count.
 */

const KEY = "test.concurrency.counter";

beforeAll(async () => {
  await db
    .insert(settings)
    .values({ key: KEY, value: JSON.stringify(0) })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(0) } });
});

/** One increment, in its own transaction — the shape every money path uses. */
async function bump() {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(settings).where(eq(settings.key, KEY));
    const next = Number(JSON.parse(row!.value as string)) + 1;
    await tx
      .update(settings)
      .set({ value: JSON.stringify(next) })
      .where(eq(settings.key, KEY));
    return next;
  });
}

describe("concurrent transactions", () => {
  it("does not throw SQLITE_BUSY when several run at once", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => bump()));

    const failures = results.filter((r) => r.status === "rejected");
    // Any failure here is the driver refusing to wait, not a business rule.
    expect(failures.map((f) => String((f as PromiseRejectedResult).reason))).toEqual([]);
  });

  it("serialises them, so every increment lands", async () => {
    await db
      .update(settings)
      .set({ value: JSON.stringify(0) })
      .where(eq(settings.key, KEY));

    await Promise.all(Array.from({ length: 8 }, () => bump()));

    const [row] = await db.select().from(settings).where(eq(settings.key, KEY));
    // Read-modify-write inside a write transaction: eight increments, eight
    // applied. A lost update here would mean the lock is not doing its job.
    expect(Number(JSON.parse(row!.value as string))).toBe(8);
  });

  it("leaves the connection usable straight afterwards", async () => {
    // The lingering half of the problem: a contended commit used to leave the
    // file busy long enough to knock over the next sequential caller, which is
    // why the suites had to be ordered around it.
    await Promise.allSettled([bump(), bump()]);
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(settings);
    expect(Number(row!.n)).toBeGreaterThan(0);
  });
});
