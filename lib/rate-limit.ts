import "server-only";
import { env } from "@/lib/env";

/**
 * Minimal in-memory sliding-window rate limiter, keyed by an arbitrary string
 * (usually client IP + route). Adequate for a single-instance self-hosted
 * deployment; swap for a Redis/DB-backed limiter if the app is ever horizontally
 * scaled.
 */
type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Hit>();

export function rateLimit(
  key: string,
  { limit = 5, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const hit = buckets.get(key);

  if (!hit || hit.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  hit.count += 1;
  if (hit.count > limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((hit.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - hit.count, retryAfterSec: 0 };
}

/**
 * Best-effort client IP from proxy headers. The forwarded headers are only
 * honored when `TRUST_PROXY` is set (the app sits behind a proxy that overwrites
 * them); otherwise they're ignored, since a client could spoof them to rotate
 * its rate-limit key. Without a trusted proxy every request shares one bucket —
 * conservative, but not bypassable.
 */
export function clientIp(req: Request): string {
  return clientIpFromHeaders(req.headers);
}

/**
 * The same, for a caller holding headers rather than a whole `Request` — a
 * Server Component reading `await headers()`, which is how a *page* rate-limits
 * itself. `/traccia` needs this: it is an unauthenticated PII lookup that lives
 * on a page rather than behind an API route, and was the only public entry
 * point in the app with no limit at all.
 */
export function clientIpFromHeaders(h: Headers | { get(name: string): string | null }): string {
  if (!env.trustProxy) return "untrusted-proxy";
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

// Opportunistic cleanup so the map can't grow unbounded.
if (typeof globalThis !== "undefined") {
  const g = globalThis as unknown as { __rlCleanup?: boolean };
  if (!g.__rlCleanup) {
    g.__rlCleanup = true;
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }, 5 * 60_000).unref?.();
  }
}

/**
 * Durable, DB-backed sliding window — same contract as `rateLimit`, but the
 * counter survives a process restart and is shared across instances.
 *
 * Use it for the auth-sensitive endpoints (login, registration, password reset)
 * and nothing else. The in-memory limiter above is free; this one costs a write
 * per call, which is the right trade only where the limit is a security control
 * rather than flood protection.
 *
 * The upsert is one statement — `ON CONFLICT ... DO UPDATE` with the window
 * check inline — so two concurrent requests cannot both read a stale count and
 * both decide they are the first. `excluded.reset_at` is the *new* window's
 * expiry, so an expired bucket restarts rather than accumulating forever.
 */
export async function rateLimitDurable(
  key: string,
  { limit = 5, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): Promise<{ ok: boolean; remaining: number; retryAfterSec: number }> {
  const { db } = await import("@/lib/db/client");
  const { rateLimits } = await import("@/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  const now = Date.now();
  const resetAt = new Date(now + windowMs);

  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          // Expired window → start a new one at 1; live window → increment.
          count: sql`case when ${rateLimits.resetAt} <= ${now} then 1 else ${rateLimits.count} + 1 end`,
          resetAt: sql`case when ${rateLimits.resetAt} <= ${now} then excluded.reset_at else ${rateLimits.resetAt} end`,
        },
      })
      .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

    if (!row) return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
    if (row.count > limit) {
      return {
        ok: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - now) / 1000)),
      };
    }
    return { ok: true, remaining: Math.max(0, limit - row.count), retryAfterSec: 0 };
  } catch (err) {
    // A limiter that hard-fails takes the login page down with it. Fall back to
    // the in-memory bucket, which is weaker but never unavailable.
    console.error("[rate-limit] durable store unavailable, falling back to memory:", err);
    return rateLimit(key, { limit, windowMs });
  }
}

/** Drop finished windows. Run from the maintenance cron sweep. */
export async function deleteExpiredRateLimits(): Promise<{ deleted: number }> {
  const { db } = await import("@/lib/db/client");
  const { rateLimits } = await import("@/lib/db/schema");
  const { lt } = await import("drizzle-orm");
  const res = await db.delete(rateLimits).where(lt(rateLimits.resetAt, new Date()));
  return { deleted: res.rowsAffected };
}
