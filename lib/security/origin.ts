import "server-only";
import { env } from "@/lib/env";

/**
 * Same-origin (CSRF) guard for the hand-rolled JSON API routes.
 *
 * Next.js Server Actions already get a built-in Origin check, but the public
 * `POST /api/*` handlers (login, register, checkout, newsletter, reservations,
 * loyalty redeem) are plain route handlers with no such protection — they rely
 * only on the session cookie being `SameSite=Lax`. Lax still allows top-level
 * cross-site POSTs in some flows, so we add an explicit Origin/Referer check as
 * defence-in-depth: a browser fetch/XHR/`sendBeacon` always sends an `Origin`
 * header, and we require it to match one of our own origins.
 *
 * Deliberately NOT applied to: the Stripe webhook (legitimately cross-origin,
 * authenticated by signature), the cron endpoint (bearer-token authenticated),
 * and the newsletter confirm/unsubscribe GET links (followed from an email, so
 * they carry no same-origin Origin header).
 */

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The set of origins we consider "ourselves" for a given request. */
function allowedOrigins(request: Request): Set<string> {
  const set = new Set<string>();
  const configured = originOf(env.siteUrl);
  if (configured) set.add(configured);

  // Also trust the request's own host (behind Caddy the forwarded proto/host is
  // authoritative), so the check works even before NEXT_PUBLIC_SITE_URL is set.
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") ?? (env.isProd ? "https" : "http");
    set.add(`${proto}://${host}`);
  }
  return set;
}

/** True when the request originates from one of our own pages. */
export function isSameOrigin(request: Request): boolean {
  const allowed = allowedOrigins(request);

  const origin = request.headers.get("origin");
  if (origin) return allowed.has(origin);

  // Some browsers omit Origin on same-origin requests in narrow cases; fall back
  // to the Referer origin when present.
  const refererOrigin = originOf(request.headers.get("referer"));
  if (refererOrigin) return allowed.has(refererOrigin);

  // A state-changing browser request should have carried one of the two. Its
  // absence is treated as cross-origin and rejected.
  return false;
}
