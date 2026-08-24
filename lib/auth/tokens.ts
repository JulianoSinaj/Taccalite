import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { authTokens, type AuthTokenPurpose } from "@/lib/db/schema";

/**
 * One-shot emailed tokens: password reset and email verification.
 *
 * The plaintext token exists in exactly two places — the URL in the email, and
 * the request that redeems it. Only its SHA-256 lands in the database, so a
 * backup, a stray dump or a read-only injection cannot mint a session. A fast
 * hash is correct here (unlike for passwords): the input is 32 bytes from the
 * CSPRNG, so there is no offline search to slow down, and the lookup happens on
 * every click of every link.
 *
 * Redemption is a single atomic UPDATE ... WHERE used_at IS NULL RETURNING —
 * the same claim pattern `applyOrderStock` uses — so two concurrent clicks on
 * the same link cannot both succeed.
 */

const TTL_MS: Record<AuthTokenPurpose, number> = {
  // Short: a reset link is a live credential for the account.
  password_reset: 1000 * 60 * 60, // 1 hour
  // Long: this one is often clicked from a phone hours later, and holding it
  // open costs nothing — it proves an address, it does not grant a session.
  email_verify: 1000 * 60 * 60 * 24, // 24 hours
};

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export type IssuedToken = { token: string; expiresAt: Date };

/**
 * Mint a token, invalidating any outstanding one of the same purpose for this
 * user.
 *
 * Superseding matters: without it, "resend the email" leaves both links live,
 * so a token captured from the first message keeps working after the customer
 * has requested a new one — which is precisely the moment they suspect
 * something is wrong.
 *
 * `email` is the address being proven. For `email_verify` that may be a *new*
 * address not yet written to the user row; for `password_reset` it records
 * where the link was sent.
 */
export async function issueToken(
  userId: string,
  purpose: AuthTokenPurpose,
  email?: string | null,
): Promise<IssuedToken> {
  await db
    .delete(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TTL_MS[purpose]);
  await db.insert(authTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(token),
    email: email ?? null,
    expiresAt,
  });
  return { token, expiresAt };
}

export type ConsumedToken = { userId: string; email: string | null };

/**
 * Spend a token. Returns null when it is unknown, of the wrong purpose, expired
 * or already used — the caller must not distinguish those to the client beyond
 * what `inspectToken` is for.
 */
export async function consumeToken(
  plaintext: string,
  purpose: AuthTokenPurpose,
): Promise<ConsumedToken | null> {
  if (!plaintext) return null;
  const now = new Date();
  const [claimed] = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(plaintext)),
        eq(authTokens.purpose, purpose),
        sql`${authTokens.usedAt} is null`,
        sql`${authTokens.expiresAt} > ${now.getTime()}`,
      ),
    )
    .returning({ userId: authTokens.userId, email: authTokens.email });
  return claimed ?? null;
}

export type TokenState = "valid" | "used" | "expired" | "unknown";

/**
 * Why a token won't work, without spending it.
 *
 * Only ever used to choose the wording on the landing page: "questo link è già
 * stato usato" and "questo link è scaduto" both tell the visitor what to do
 * next, where a flat "non valido" leaves them clicking the same dead link. It
 * leaks nothing an attacker holding the token doesn't already know.
 */
export async function inspectToken(
  plaintext: string,
  purpose: AuthTokenPurpose,
): Promise<TokenState> {
  if (!plaintext) return "unknown";
  const [row] = await db
    .select({ usedAt: authTokens.usedAt, expiresAt: authTokens.expiresAt })
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(plaintext)), eq(authTokens.purpose, purpose)))
    .limit(1);
  if (!row) return "unknown";
  if (row.usedAt) return "used";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  return "valid";
}

/** Drop every outstanding token of a purpose for a user (e.g. after the
 *  password changed by another route, so old reset links die with it). */
export async function revokeTokens(userId: string, purpose: AuthTokenPurpose): Promise<void> {
  await db
    .delete(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));
}

/** Garbage-collect expired rows. Run from the maintenance cron sweep. */
export async function deleteExpiredAuthTokens(): Promise<{ deleted: number }> {
  const res = await db.delete(authTokens).where(lt(authTokens.expiresAt, new Date()));
  return { deleted: res.rowsAffected };
}
