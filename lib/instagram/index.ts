import "server-only";
import { env } from "@/lib/env";
import { getSetting, setSetting } from "@/lib/db/queries";
import { FALLBACK_FEED } from "./fallback";
import {
  MEDIA_FIELDS_BASIC,
  MEDIA_FIELDS_RICH,
  PROFILE_FIELDS_BASIC,
  PROFILE_FIELDS_RICH,
  graphErrorCode,
  graphErrorMessage,
  parseMediaResponse,
  parseProfileResponse,
  type InstagramFeed,
  type InstagramProfile,
} from "./parse";

export type { InstagramFeed, InstagramPost, InstagramProfile } from "./parse";
export { FALLBACK_FEED } from "./fallback";

/**
 * Instagram feed for the homepage.
 *
 * Token resolution: the admin-saved token (settings `instagram.accessToken`)
 * wins over `INSTAGRAM_ACCESS_TOKEN` from the environment — refreshed tokens
 * are persisted to settings, so the env value is only ever a bootstrap.
 *
 * Caching: one upstream round-trip per `FEED_TTL_MS` per process, deduped
 * across concurrent renders. The last good feed is also persisted to the
 * settings table so a restart (or an Instagram outage / expired token) keeps
 * serving the previous posts instead of an empty section.
 */

const GRAPH = `https://graph.instagram.com/${env.instagram.apiVersion}`;
const FEED_TTL_MS = 30 * 60 * 1000; // 30 min between upstream fetches
const RETRY_BACKOFF_MS = 5 * 60 * 1000; // after a failure, don't hammer the API
const FETCH_TIMEOUT_MS = 8_000;
export const FEED_LIMIT = 8;

// Settings keys (all under the `instagram.` prefix; hidden from the raw admin JSON list)
export const IG_KEYS = {
  token: "instagram.accessToken",
  tokenRefreshedAt: "instagram.tokenRefreshedAt",
  tokenExpiresAt: "instagram.tokenExpiresAt",
  tokenSource: "instagram.tokenSource",
  feedCache: "instagram.feedCache",
  lastError: "instagram.lastError",
} as const;

type TokenSource = "settings" | "env" | "none";
type ResolvedToken = { token: string; source: TokenSource };

async function resolveToken(): Promise<ResolvedToken> {
  const stored = await getSetting<unknown>(IG_KEYS.token, null);
  if (typeof stored === "string" && stored.trim() !== "") return { token: stored.trim(), source: "settings" };
  if (env.instagram.accessToken) return { token: env.instagram.accessToken, source: "env" };
  return { token: "", source: "none" };
}

/** Whether a token is available at all (settings or env). */
export async function instagramConfigured(): Promise<boolean> {
  return (await resolveToken()).source !== "none";
}

// ── Low-level Graph calls ────────────────────────────────────────────────────

class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Graph error `code`: 190 = bad/expired token, 100 = invalid param/field. */
    readonly code: number | null,
  ) {
    super(message);
    this.name = "GraphError";
  }
}

async function graphGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new GraphError(graphErrorMessage(body, `Instagram API ${res.status}`), res.status, graphErrorCode(body));
  }
  return body;
}

/** Try the rich field set first; fall back to the basic one when a field is
 *  rejected (Graph code 100 — non-professional account / restricted permission).
 *  Token errors (code 190) are NOT retried: they'd fail identically. */
async function graphGetWithFallback(
  path: string,
  token: string,
  rich: string,
  basic: string,
  extra: Record<string, string> = {},
): Promise<unknown> {
  try {
    return await graphGet(path, { fields: rich, access_token: token, ...extra });
  } catch (err) {
    if (err instanceof GraphError && err.status === 400 && err.code === 100) {
      return graphGet(path, { fields: basic, access_token: token, ...extra });
    }
    throw err;
  }
}

async function fetchProfile(token: string): Promise<InstagramProfile | null> {
  const body = await graphGetWithFallback("me", token, PROFILE_FIELDS_RICH, PROFILE_FIELDS_BASIC);
  return parseProfileResponse(body);
}

async function fetchMedia(token: string, limit: number) {
  const body = await graphGetWithFallback("me/media", token, MEDIA_FIELDS_RICH, MEDIA_FIELDS_BASIC, {
    // Over-fetch a little: some nodes (e.g. expired media) are dropped by the parser.
    limit: String(Math.min(limit + 4, 50)),
  });
  return parseMediaResponse(body, limit);
}

/** Validate a token by asking who it belongs to. Throws with a user-facing
 *  message on failure. Used by the admin "connect" action. */
export async function verifyInstagramToken(token: string): Promise<InstagramProfile> {
  const profile = await fetchProfile(token);
  if (!profile) throw new Error("Risposta inattesa da Instagram: profilo non riconosciuto.");
  return profile;
}

// ── Feed cache ───────────────────────────────────────────────────────────────

const EMPTY_FEED: InstagramFeed = { profile: null, posts: [], fetchedAt: 0 };

let memo: InstagramFeed | null = null;
let memoLoadedFromDb = false;
let nextFetchAt = 0;
let inflight: Promise<InstagramFeed> | null = null;

function isFeed(v: unknown): v is InstagramFeed {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as InstagramFeed).posts) &&
    typeof (v as InstagramFeed).fetchedAt === "number"
  );
}

async function fetchFreshFeed(token: string): Promise<InstagramFeed> {
  const [posts, profile] = await Promise.all([
    fetchMedia(token, FEED_LIMIT),
    // Profile is decorative (counts/avatar) — never let it fail the whole feed.
    fetchProfile(token).catch(() => null),
  ]);
  return { profile, posts, fetchedAt: Date.now() };
}

/**
 * Latest posts (+ profile) for the homepage. Never throws: on any failure it
 * returns the last good feed (memory → DB) or an empty feed.
 */
export async function getInstagramFeed(): Promise<InstagramFeed> {
  const { token } = await resolveToken();
  if (!token) return EMPTY_FEED;

  const now = Date.now();
  if (memo && now < nextFetchAt) return memo;

  // Cold start: seed from the persisted copy so we can serve instantly and only
  // go upstream if it's stale.
  if (!memo && !memoLoadedFromDb) {
    memoLoadedFromDb = true;
    const stored = await getSetting<unknown>(IG_KEYS.feedCache, null);
    if (isFeed(stored)) {
      memo = stored;
      nextFetchAt = stored.fetchedAt + FEED_TTL_MS;
      if (now < nextFetchAt) return memo;
    }
  }

  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const feed = await fetchFreshFeed(token);
      memo = feed;
      nextFetchAt = feed.fetchedAt + FEED_TTL_MS;
      await Promise.all([setSetting(IG_KEYS.feedCache, feed), setSetting(IG_KEYS.lastError, null)]).catch(
        () => {},
      );
      return feed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[instagram] feed fetch failed:", message);
      nextFetchAt = Date.now() + RETRY_BACKOFF_MS;
      await setSetting(IG_KEYS.lastError, { message, at: Date.now() }).catch(() => {});
      return memo ?? EMPTY_FEED;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * What the public site renders: the live feed when there is one, the shipped
 * archive (`./fallback`) when there isn't.
 *
 * Kept separate from `getInstagramFeed` on purpose. That function is the honest
 * report of what Instagram gave us, and the gestionale leans on it — "aggiorna
 * ora" tells the shop the refresh returned nothing precisely by seeing an empty
 * `posts`. Folding the archive in there would have turned every failed fetch
 * into a cheerful "feed aggiornato: 12 post".
 */
export async function getInstagramFeedForSite(): Promise<InstagramFeed> {
  const feed = await getInstagramFeed();
  if (feed.posts.length > 0) return feed;
  // The archive holds more than the API hands over in one page. Serving all of
  // it would mean the homepage grid *shrank* the day a token was connected, so
  // it is trimmed to the same window the live path uses.
  return { ...FALLBACK_FEED, posts: FALLBACK_FEED.posts.slice(0, FEED_LIMIT) };
}

/** Drop the in-memory + persisted cache so the next render refetches. */
export async function invalidateInstagramFeed(): Promise<void> {
  memo = null;
  memoLoadedFromDb = true; // don't re-seed from the (now stale) DB copy
  nextFetchAt = 0;
  await setSetting(IG_KEYS.feedCache, null).catch(() => {});
}

// ── Token lifecycle ──────────────────────────────────────────────────────────

/** Persist a token from the admin panel (after `verifyInstagramToken`). */
export async function saveInstagramToken(token: string, expiresInSec?: number): Promise<void> {
  const now = Date.now();
  await Promise.all([
    setSetting(IG_KEYS.token, token),
    setSetting(IG_KEYS.tokenSource, "settings"),
    setSetting(IG_KEYS.tokenRefreshedAt, now),
    setSetting(IG_KEYS.tokenExpiresAt, expiresInSec ? now + expiresInSec * 1000 : null),
  ]);
  await invalidateInstagramFeed();
}

/** Remove the admin-saved token (falls back to the env token, if any). */
export async function clearInstagramToken(): Promise<void> {
  await Promise.all([
    setSetting(IG_KEYS.token, null),
    setSetting(IG_KEYS.tokenSource, null),
    setSetting(IG_KEYS.tokenRefreshedAt, null),
    setSetting(IG_KEYS.tokenExpiresAt, null),
    setSetting(IG_KEYS.lastError, null),
  ]);
  await invalidateInstagramFeed();
}

const REFRESH_EVERY_MS = 7 * 24 * 60 * 60 * 1000; // weekly is plenty for a 60-day token

/**
 * Exchange the current long-lived token for a fresh one (Instagram long-lived
 * tokens last 60 days and can be refreshed once they're at least 24h old).
 * Persists the new token to settings. Returns the new expiry, or throws.
 */
export async function refreshInstagramToken(): Promise<{ expiresAt: number }> {
  const { token } = await resolveToken();
  if (!token) throw new Error("Nessun token Instagram configurato.");
  const body = await graphGet("refresh_access_token", {
    grant_type: "ig_refresh_token",
    access_token: token,
  });
  const next =
    typeof body === "object" && body !== null ? (body as { access_token?: unknown; expires_in?: unknown }) : {};
  if (typeof next.access_token !== "string" || next.access_token === "") {
    throw new Error("Instagram non ha restituito un nuovo token.");
  }
  const expiresIn = typeof next.expires_in === "number" ? next.expires_in : 60 * 24 * 60 * 60;
  const now = Date.now();
  const expiresAt = now + expiresIn * 1000;
  await Promise.all([
    setSetting(IG_KEYS.token, next.access_token),
    setSetting(IG_KEYS.tokenSource, "settings"),
    setSetting(IG_KEYS.tokenRefreshedAt, now),
    setSetting(IG_KEYS.tokenExpiresAt, expiresAt),
    setSetting(IG_KEYS.lastError, null),
  ]);
  return { expiresAt };
}

/**
 * Cron entry: refresh the token at most once a week. Safe inside the frequent
 * `job=all` sweep — it no-ops when there's no token or it was refreshed recently.
 */
export async function runInstagramTokenRefresh(
  now = new Date(),
): Promise<{ status: "skipped" | "refreshed" | "failed"; reason?: string; expiresAt?: number }> {
  const { token, source } = await resolveToken();
  if (!token) return { status: "skipped", reason: "not-configured" };
  const refreshedAt = await getSetting<unknown>(IG_KEYS.tokenRefreshedAt, null);
  // An env-bootstrapped token has no refresh stamp: refresh it once (>24h after
  // it was issued) so its successor lives in settings and keeps rolling.
  if (typeof refreshedAt === "number" && now.getTime() - refreshedAt < REFRESH_EVERY_MS) {
    return { status: "skipped", reason: "recent" };
  }
  try {
    const { expiresAt } = await refreshInstagramToken();
    return { status: "refreshed", expiresAt };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[instagram] token refresh failed (source=${source}):`, message);
    await setSetting(IG_KEYS.lastError, { message: `Refresh token: ${message}`, at: Date.now() }).catch(
      () => {},
    );
    return { status: "failed", reason: message };
  }
}

// ── Admin status ─────────────────────────────────────────────────────────────

export type InstagramStatus = {
  configured: boolean;
  source: TokenSource;
  tokenRefreshedAt: number | null;
  tokenExpiresAt: number | null;
  /** Whole days until the token expires (negative = expired); null when unknown. */
  tokenDaysLeft: number | null;
  lastError: { message: string; at: number } | null;
  cache: { fetchedAt: number; posts: number; username: string | null } | null;
};

export async function getInstagramStatus(): Promise<InstagramStatus> {
  const { source } = await resolveToken();
  const [refreshedAt, expiresAt, lastError, cached] = await Promise.all([
    getSetting<unknown>(IG_KEYS.tokenRefreshedAt, null),
    getSetting<unknown>(IG_KEYS.tokenExpiresAt, null),
    getSetting<unknown>(IG_KEYS.lastError, null),
    getSetting<unknown>(IG_KEYS.feedCache, null),
  ]);
  const feed = isFeed(cached) ? cached : memo;
  const expiresAtMs = typeof expiresAt === "number" ? expiresAt : null;
  return {
    configured: source !== "none",
    source,
    tokenRefreshedAt: typeof refreshedAt === "number" ? refreshedAt : null,
    tokenExpiresAt: expiresAtMs,
    tokenDaysLeft: expiresAtMs != null ? Math.floor((expiresAtMs - Date.now()) / 86_400_000) : null,
    lastError:
      typeof lastError === "object" &&
      lastError !== null &&
      typeof (lastError as { message?: unknown }).message === "string"
        ? (lastError as { message: string; at: number })
        : null,
    cache: feed
      ? { fetchedAt: feed.fetchedAt, posts: feed.posts.length, username: feed.profile?.username ?? null }
      : null,
  };
}
