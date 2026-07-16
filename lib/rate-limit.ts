import "server-only";

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

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string {
  const h = req.headers;
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
