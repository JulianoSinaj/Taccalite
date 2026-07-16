import "server-only";
import { customAlphabet } from "nanoid";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loyaltyAccounts, loyaltyTransactions, redemptions, rewards } from "@/lib/db/schema";

const cardCode = customAlphabet("0123456789", 4);

export function generateCardNumber(): string {
  return `TAC-${new Date().getFullYear()}-${cardCode()}`;
}

/** Fetch (or lazily create) a customer's loyalty account. */
export async function getOrCreateLoyaltyAccount(userId: string) {
  const existing = await db
    .select()
    .from(loyaltyAccounts)
    .where(eq(loyaltyAccounts.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(loyaltyAccounts)
    .values({ userId, points: 0, cardNumber: generateCardNumber() })
    .returning();
  return created;
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

/** Credit or debit points and record the ledger entry. */
export async function addPoints(
  userId: string,
  delta: number,
  reason: string,
  byUserId?: string,
): Promise<{ points: number }> {
  const account = await getOrCreateLoyaltyAccount(userId);
  const newBalance = Math.max(0, account.points + delta);

  await db
    .update(loyaltyAccounts)
    .set({ points: newBalance })
    .where(eq(loyaltyAccounts.userId, userId));

  await db.insert(loyaltyTransactions).values({
    userId,
    delta,
    balanceAfter: newBalance,
    reason,
    createdByUserId: byUserId ?? null,
  });

  return { points: newBalance };
}

export type RedeemResult =
  | { ok: true; pointsLeft: number; reference: string }
  | { ok: false; error: string };

/** Redeem a reward for a customer if they have enough points. */
export async function redeemReward(userId: string, rewardId: string): Promise<RedeemResult> {
  const [reward] = await db
    .select()
    .from(rewards)
    .where(and(eq(rewards.id, rewardId), eq(rewards.active, true)))
    .limit(1);
  if (!reward) return { ok: false, error: "Premio non disponibile" };

  const account = await getOrCreateLoyaltyAccount(userId);
  if (account.points < reward.points) {
    return { ok: false, error: "Punti insufficienti per questo premio" };
  }

  const { points } = await addPoints(userId, -reward.points, `Riscatto: ${reward.name}`);
  const [redemption] = await db
    .insert(redemptions)
    .values({
      userId,
      rewardId: reward.id,
      rewardName: reward.name,
      pointsSpent: reward.points,
      status: "pending",
    })
    .returning({ id: redemptions.id });

  return { ok: true, pointsLeft: points, reference: redemption.id };
}
