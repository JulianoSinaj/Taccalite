import "server-only";
import { customAlphabet } from "nanoid";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loyaltyAccounts, loyaltyTransactions, redemptions, rewards } from "@/lib/db/schema";

/** Thrown inside the redeem transaction to roll it back on insufficient points. */
class InsufficientPointsError extends Error {}

const cardCode = customAlphabet("0123456789", 4);

export function generateCardNumber(): string {
  return `TAC-${new Date().getFullYear()}-${cardCode()}`;
}

/** Fetch (or lazily create) a customer's loyalty account. */
export async function getOrCreateLoyaltyAccount(userId: string) {
  // Atomic upsert instead of select-then-insert: two concurrent first-touch
  // calls would otherwise both see no row and both insert, and the second would
  // hit the unique(userId) constraint. `onConflictDoNothing` on userId makes the
  // insert idempotent; we then read the row back (whether just created or not).
  await db
    .insert(loyaltyAccounts)
    .values({ userId, points: 0, cardNumber: generateCardNumber() })
    .onConflictDoNothing({ target: loyaltyAccounts.userId });

  const [account] = await db
    .select()
    .from(loyaltyAccounts)
    .where(eq(loyaltyAccounts.userId, userId))
    .limit(1);
  if (!account) throw new Error(`Loyalty account could not be created for user ${userId}`);
  return account;
}

export async function getLoyaltySummary(userId: string) {
  const account = await getOrCreateLoyaltyAccount(userId);
  const [transactions, allRewards] = await Promise.all([
    db
      .select()
      .from(loyaltyTransactions)
      .where(eq(loyaltyTransactions.userId, userId))
      .orderBy(desc(loyaltyTransactions.createdAt))
      .limit(20),
    db.select().from(rewards).where(eq(rewards.active, true)).orderBy(rewards.sortOrder),
  ]);

  const nextReward =
    allRewards
      .filter((r) => r.points > account.points)
      .sort((a, b) => a.points - b.points)[0] ?? null;

  return { account, transactions, rewards: allRewards, nextReward };
}

/**
 * Credit or debit points and record the ledger entry — atomically.
 *
 * The balance is mutated with a single `points = MAX(0, points + delta)` UPDATE
 * inside a transaction that also writes the ledger row, so concurrent accruals
 * can't lose an update or record a `balanceAfter` that disagrees with the account.
 */
export async function addPoints(
  userId: string,
  delta: number,
  reason: string,
  byUserId?: string,
): Promise<{ points: number }> {
  await getOrCreateLoyaltyAccount(userId); // ensure the account row exists

  return db.transaction((tx) => {
    const [updated] = tx
      .update(loyaltyAccounts)
      .set({ points: sql`max(0, ${loyaltyAccounts.points} + ${delta})` })
      .where(eq(loyaltyAccounts.userId, userId))
      .returning({ points: loyaltyAccounts.points })
      .all();

    tx.insert(loyaltyTransactions)
      .values({
        userId,
        delta,
        balanceAfter: updated.points,
        reason,
        createdByUserId: byUserId ?? null,
      })
      .run();

    return { points: updated.points };
  });
}

export type RedeemResult =
  | { ok: true; pointsLeft: number; reference: string }
  | { ok: false; error: string };

/**
 * Redeem a reward for a customer if they have enough points.
 *
 * The point-check, debit, ledger write, and redemption insert all happen inside a
 * single transaction, so two concurrent redeems can't both pass the check (TOCTOU)
 * and a crash mid-way can't leave a debit without its audit row.
 */
export async function redeemReward(userId: string, rewardId: string): Promise<RedeemResult> {
  const [reward] = await db
    .select()
    .from(rewards)
    .where(and(eq(rewards.id, rewardId), eq(rewards.active, true)))
    .limit(1);
  if (!reward) return { ok: false, error: "Premio non disponibile" };

  await getOrCreateLoyaltyAccount(userId); // ensure the account row exists

  try {
    const result = db.transaction((tx) => {
      const [account] = tx
        .select({ points: loyaltyAccounts.points })
        .from(loyaltyAccounts)
        .where(eq(loyaltyAccounts.userId, userId))
        .all();
      if (!account || account.points < reward.points) throw new InsufficientPointsError();

      const newBalance = account.points - reward.points;
      tx.update(loyaltyAccounts)
        .set({ points: newBalance })
        .where(eq(loyaltyAccounts.userId, userId))
        .run();
      tx.insert(loyaltyTransactions)
        .values({
          userId,
          delta: -reward.points,
          balanceAfter: newBalance,
          reason: `Riscatto: ${reward.name}`,
        })
        .run();
      const [redemption] = tx
        .insert(redemptions)
        .values({
          userId,
          rewardId: reward.id,
          rewardName: reward.name,
          pointsSpent: reward.points,
          status: "pending",
        })
        .returning({ id: redemptions.id })
        .all();

      return { pointsLeft: newBalance, reference: redemption.id };
    });

    return { ok: true, ...result };
  } catch (err) {
    if (err instanceof InsufficientPointsError) {
      return { ok: false, error: "Punti insufficienti per questo premio" };
    }
    throw err;
  }
}
