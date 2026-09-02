import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { rewards, redemptions, users, loyaltyAccounts } from "@/lib/db/schema";
import { rewardAvailability, redeemReward, getLoyaltySummary, addPoints } from "@/lib/loyalty";

const REWARD = "rw-avail";
const USER = "rw-user";

// The pure helper takes `now` as an argument, so these three are fixed.
const NOW = new Date("2027-06-15T12:00:00Z");
const BEFORE = new Date("2027-06-01T00:00:00Z");
const AFTER = new Date("2027-07-01T00:00:00Z");

// `redeemReward` and `getLoyaltySummary` read the real clock, so their windows
// have to be relative to it rather than to the fixed date above.
const DAY_MS = 86_400_000;
const YESTERDAY = () => new Date(Date.now() - DAY_MS);
const TOMORROW = () => new Date(Date.now() + DAY_MS);

beforeAll(async () => {
  await db
    .insert(users)
    .values({ id: USER, username: "rw-tester", name: "Premi", role: "customer", passwordHash: "x" })
    .onConflictDoNothing({ target: users.id });
});

beforeEach(async () => {
  await db.delete(redemptions).where(eq(redemptions.rewardId, REWARD));
  await db.delete(rewards).where(eq(rewards.id, REWARD));
  await db.delete(loyaltyAccounts).where(eq(loyaltyAccounts.userId, USER));
});

async function makeReward(over: Partial<typeof rewards.$inferInsert> = {}) {
  await db.insert(rewards).values({
    id: REWARD,
    slug: `rw-avail-${Math.abs(Number(over.points ?? 10))}`,
    name: "Cesto di prova",
    points: 10,
    active: true,
    ...over,
  });
}

describe("rewardAvailability — one answer for display and enforcement", () => {
  it("is available with no stock limit and no window", () => {
    expect(rewardAvailability({ stock: null, availableFrom: null, availableUntil: null }, NOW)).toBeNull();
  });

  it("is available while stock remains", () => {
    expect(rewardAvailability({ stock: 3, availableFrom: null, availableUntil: null }, NOW)).toBeNull();
  });

  it("reports out_of_stock at zero — not at null, which means unlimited", () => {
    expect(rewardAvailability({ stock: 0, availableFrom: null, availableUntil: null }, NOW)).toBe(
      "out_of_stock",
    );
    expect(rewardAvailability({ stock: null, availableFrom: null, availableUntil: null }, NOW)).toBeNull();
  });

  it("reports not_yet before the window opens and expired after it shuts", () => {
    expect(rewardAvailability({ stock: null, availableFrom: AFTER, availableUntil: null }, NOW)).toBe(
      "not_yet",
    );
    expect(rewardAvailability({ stock: null, availableFrom: null, availableUntil: BEFORE }, NOW)).toBe(
      "expired",
    );
    expect(
      rewardAvailability({ stock: null, availableFrom: BEFORE, availableUntil: AFTER }, NOW),
    ).toBeNull();
  });

  it("the window wins over stock, so the message names the real obstacle", () => {
    expect(rewardAvailability({ stock: 0, availableFrom: AFTER, availableUntil: null }, NOW)).toBe(
      "not_yet",
    );
  });
});

describe("getLoyaltySummary — the account page stops offering what it can't give", () => {
  it("annotates a sold-out reward instead of hiding it", async () => {
    await makeReward({ stock: 0 });
    const summary = await getLoyaltySummary(USER);
    const row = summary.rewards.find((r) => r.id === REWARD);
    expect(row).toBeDefined();
    expect(row!.unavailable).toBe("out_of_stock");
  });

  it("leaves a healthy reward unannotated", async () => {
    await makeReward({ stock: 5 });
    const summary = await getLoyaltySummary(USER);
    expect(summary.rewards.find((r) => r.id === REWARD)!.unavailable).toBeNull();
  });

  it("never points «il prossimo premio» at one that can't be claimed", async () => {
    await makeReward({ stock: 0, points: 5 });
    const summary = await getLoyaltySummary(USER);
    // Balance is 0, so a claimable 5-point reward would be the next goal.
    expect(summary.nextReward?.id).not.toBe(REWARD);
  });
});

describe("redeemReward — refuses for the same reasons the page greys out", () => {
  it("refuses a sold-out reward with a message naming stock", async () => {
    await makeReward({ stock: 0 });
    await addPoints(USER, 50, "test");
    const res = await redeemReward(USER, REWARD);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/esaurito/i);
  });

  it("refuses a reward whose window has closed", async () => {
    await makeReward({ availableUntil: YESTERDAY() });
    await addPoints(USER, 50, "test");
    const res = await redeemReward(USER, REWARD);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/non è più disponibile/i);
  });

  it("refuses a reward whose window has not opened yet", async () => {
    await makeReward({ availableFrom: TOMORROW() });
    await addPoints(USER, 50, "test");
    const res = await redeemReward(USER, REWARD);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/non è ancora disponibile/i);
  });

  it("still succeeds, and decrements stock, when it is genuinely available", async () => {
    await makeReward({ stock: 2 });
    await addPoints(USER, 50, "test");
    const res = await redeemReward(USER, REWARD);
    expect(res.ok).toBe(true);
    const [after] = await db.select().from(rewards).where(eq(rewards.id, REWARD));
    expect(after.stock).toBe(1);
  });
});

/**
 * The per-customer cap has to hold where the writes happen.
 *
 * It used to be counted before the transaction that debits the points and
 * claims the stock, so a customer with enough points for two could take a "one
 * per customer" reward twice by sending both requests at once: both counted
 * zero, both passed. The points were debited correctly either way, so what was
 * lost was the cap, not the balance — but a cap that only holds when nobody is
 * in a hurry is not a cap.
 */
describe("per-customer cap under concurrency", () => {
  it("lets only one of two simultaneous claims through", async () => {
    await makeReward({ points: 10, maxPerCustomer: 1 });
    // Enough points for two, so the balance is not what refuses the second.
    await addPoints(USER, 40, "Seed");

    // Settled rather than awaited: the loser of a genuine race against a local
    // SQLite file comes back as a thrown SQLITE_BUSY rather than a refusal,
    // because nothing in the app retries a busy write (recorded against system
    // 22 — it is the data layer's to fix, not this one's). Either way it does
    // not get a redemption, which is the property under test.
    const settled = await Promise.allSettled([
      redeemReward(USER, REWARD),
      redeemReward(USER, REWARD),
    ]);
    const granted = settled.filter((r) => r.status === "fulfilled" && r.value.ok);
    expect(granted).toHaveLength(1);

    // One redemption on the books, and only one debit against the balance.
    const rows = await db
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.userId, USER), eq(redemptions.rewardId, REWARD)));
    expect(rows).toHaveLength(1);
  });
});
