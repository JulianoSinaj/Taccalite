import "server-only";
import { customAlphabet } from "nanoid";
import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loyaltyAccounts, loyaltyTransactions, redemptions, rewards, users } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail/mailer";
import { rewardUnlockedEmail } from "@/lib/mail/templates";
import { getSetting } from "@/lib/db/queries";

/** Thrown inside the redeem transaction to roll it back on insufficient points. */
class InsufficientPointsError extends Error {}

// 6 digits → a 1,000,000 namespace per year; combined with retry-on-collision
// below, a duplicate card number never surfaces as an error to the customer.
const cardCode = customAlphabet("0123456789", 6);

export function generateCardNumber(): string {
  return `TAC-${new Date().getFullYear()}-${cardCode()}`;
}

/** True when an error is the unique-constraint violation on the card number. */
function isDuplicateCardNumber(err: unknown): boolean {
  return (
    err instanceof Error &&
    /UNIQUE constraint failed:\s*loyalty_accounts\.card_number/i.test(err.message)
  );
}

/** Fetch (or lazily create) a customer's loyalty account. */
export async function getOrCreateLoyaltyAccount(userId: string) {
  // Atomic upsert instead of select-then-insert: two concurrent first-touch calls
  // would otherwise both see no row and both insert. `onConflictDoNothing` on
  // userId makes the insert idempotent — but it does NOT cover the separate
  // unique(cardNumber): a random card collision (likely as the base grows) would
  // otherwise throw and break account creation. So retry with a fresh number.
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await db
        .insert(loyaltyAccounts)
        .values({ userId, points: 0, cardNumber: generateCardNumber() })
        .onConflictDoNothing({ target: loyaltyAccounts.userId });
      break;
    } catch (err) {
      if (isDuplicateCardNumber(err) && attempt < 6) continue;
      throw err;
    }
  }

  const [account] = await db
    .select()
    .from(loyaltyAccounts)
    .where(eq(loyaltyAccounts.userId, userId))
    .limit(1);
  if (!account) throw new Error(`Loyalty account could not be created for user ${userId}`);
  return account;
}

/**
 * Look up a loyalty account by its (unique) card number, joining the owning
 * user's display name. Returns null when no card matches. Used by the in-shop
 * staff screen to resolve a scanned/typed card to an account.
 */
export async function getAccountByCard(cardNumber: string) {
  const trimmed = cardNumber.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select({
      userId: loyaltyAccounts.userId,
      points: loyaltyAccounts.points,
      cardNumber: loyaltyAccounts.cardNumber,
      name: users.name,
      username: users.username,
    })
    .from(loyaltyAccounts)
    .innerJoin(users, eq(loyaltyAccounts.userId, users.id))
    .where(eq(loyaltyAccounts.cardNumber, trimmed))
    .limit(1);
  return row ?? null;
}

export type PurchaseAccrualResult =
  | { ok: true; name: string; added: number; balance: number }
  | { ok: false; error: string };

/**
 * Accrue loyalty points for an in-shop purchase, identified by card number.
 *
 * Points = floor(euros * loyalty.pointsPerEuro). This is ACCRUAL only (the delta
 * is always ≥ 0, never a debit), which is why it's safe to expose to staff: they
 * can only ever credit points tied to a real purchase, never remove them. Unknown
 * cards and non-positive amounts are rejected without touching any balance.
 */
export async function addPointsForPurchase(
  cardNumber: string,
  euros: number,
  byUserId: string,
): Promise<PurchaseAccrualResult> {
  if (!Number.isFinite(euros) || euros <= 0) {
    return { ok: false, error: "Importo non valido" };
  }

  const account = await getAccountByCard(cardNumber);
  if (!account) return { ok: false, error: "Tessera non trovata" };

  const pointsPerEuro = await getSetting<number>("loyalty.pointsPerEuro", 1);
  const points = Math.floor(euros * pointsPerEuro);
  if (points <= 0) {
    return { ok: false, error: "L'importo non genera punti" };
  }

  const { points: balance } = await addPoints(
    account.userId,
    points,
    `Acquisto in negozio (€${euros})`,
    byUserId,
  );

  const name = account.name || account.username;
  return { ok: true, name, added: points, balance };
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
 * The balance is clamped to never go negative (satisfies the `>= 0` CHECK and is
 * correct for expiry), but the ledger records the delta **actually applied**
 * (`next − prev`), not the requested one, so summing the ledger always equals the
 * stored balance. Read + write happen inside one write-mode (BEGIN IMMEDIATE)
 * libSQL transaction, so no concurrent write interleaves.
 *
 * Returns the new balance and the delta actually applied (which differs from the
 * requested delta only when a debit was clamped at zero).
 */
export async function addPoints(
  userId: string,
  delta: number,
  reason: string,
  byUserId?: string,
): Promise<{ points: number; applied: number }> {
  await getOrCreateLoyaltyAccount(userId); // ensure the account row exists

  const result = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ points: loyaltyAccounts.points })
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.userId, userId));
    const prev = before?.points ?? 0;
    const next = Math.max(0, prev + delta);
    const applied = next - prev;

    await tx
      .update(loyaltyAccounts)
      .set({ points: next })
      .where(eq(loyaltyAccounts.userId, userId));

    await tx.insert(loyaltyTransactions).values({
      userId,
      delta: applied,
      balanceAfter: next,
      reason,
      createdByUserId: byUserId ?? null,
    });

    return { points: next, applied, prev };
  });

  // On a real accrual, tell the customer about any reward they can now afford.
  // Best-effort — never fails the points operation.
  if (result.applied > 0) {
    try {
      await notifyRewardsUnlocked(userId, result.prev, result.points);
    } catch {
      // ignore — the points are already recorded; the email is non-critical
    }
  }

  return { points: result.points, applied: result.applied };
}

/** Email the customer if their balance just crossed one or more reward thresholds. */
async function notifyRewardsUnlocked(userId: string, prevPoints: number, newPoints: number): Promise<void> {
  if (newPoints <= prevPoints) return;
  const unlocked = await db
    .select({ name: rewards.name, points: rewards.points })
    .from(rewards)
    .where(and(eq(rewards.active, true), gt(rewards.points, prevPoints), lte(rewards.points, newPoints)))
    .orderBy(rewards.points);
  if (unlocked.length === 0) return;

  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.email) return;

  await sendMail({ to: user.email, ...rewardUnlockedEmail(user.name || "", unlocked, newPoints) });
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
    const result = await db.transaction(async (tx) => {
      const [account] = await tx
        .select({ points: loyaltyAccounts.points })
        .from(loyaltyAccounts)
        .where(eq(loyaltyAccounts.userId, userId));
      if (!account || account.points < reward.points) throw new InsufficientPointsError();

      const newBalance = account.points - reward.points;
      await tx
        .update(loyaltyAccounts)
        .set({ points: newBalance })
        .where(eq(loyaltyAccounts.userId, userId));
      await tx.insert(loyaltyTransactions).values({
        userId,
        delta: -reward.points,
        balanceAfter: newBalance,
        reason: `Riscatto: ${reward.name}`,
      });
      const [redemption] = await tx
        .insert(redemptions)
        .values({
          userId,
          rewardId: reward.id,
          rewardName: reward.name,
          pointsSpent: reward.points,
          status: "pending",
        })
        .returning({ id: redemptions.id });

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
