import "server-only";
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, type UserRow } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/rate-limit";

const COOKIE = "taccalite_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days absolute cap
const IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 7; // 7 days of inactivity
// Only rewrite `lastSeenAt` when it's older than this, so a busy session doesn't
// cause a DB write on every single request (write-amplification on SQLite).
const SLIDE_INTERVAL_MS = 1000 * 60 * 60; // 1 hour

export type SessionUser = Pick<
  UserRow,
  "id" | "username" | "email" | "name" | "role" | "phone" | "shopSlug" | "emailVerifiedAt"
>;

/** Create a fresh session for a user and set the cookie. A new opaque token is
 *  minted on every login, so credentials never bind to a pre-existing token. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAX_AGE_SEC * 1000);

  // Recorded so the session list can describe each entry to its owner. Failing
  // to read the request must never block a sign-in, hence the guard: this is
  // supplementary information, not part of the credential.
  let userAgent: string | null = null;
  let ip: string | null = null;
  try {
    const h = await headers();
    userAgent = h.get("user-agent")?.slice(0, 400) ?? null;
    ip = clientIp(new Request("http://local", { headers: h }));
  } catch {
    /* no request scope (a script, a test) — leave both null */
  }

  await db
    .insert(sessions)
    .values({ id: token, userId, expiresAt, lastSeenAt: now, userAgent, ip });

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** Resolve the current session user (or null). Enforces both the absolute
 *  expiry and a sliding idle timeout; refreshes `lastSeenAt` at most hourly. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const now = new Date();
  const idleCutoff = new Date(now.getTime() - IDLE_TIMEOUT_MS);

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      name: users.name,
      role: users.role,
      phone: users.phone,
      // Read on every authenticated request because it is an access boundary
      // (`lib/admin/scope.ts`), not a preference — it has to be as fresh as the
      // role beside it.
      shopSlug: users.shopSlug,
      // Drives the "conferma la tua email" nudge and gates the self-service
      // surfaces that need a proven address.
      emailVerifiedAt: users.emailVerifiedAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, token),
        gt(sessions.expiresAt, now),
        gt(sessions.lastSeenAt, idleCutoff),
        // Defence in depth. `setUserActive` already deletes a deactivated
        // account's sessions, so in the normal path this changes nothing — but
        // this read is the enforcement point for every authenticated request,
        // and it should not depend on a *different* function having remembered
        // to clean up. A row deactivated by hand in the database, or by a future
        // code path that forgets, must not keep working until its cookie expires.
        eq(users.active, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // Slide the idle window forward, but not on every request.
  if (!row.lastSeenAt || now.getTime() - row.lastSeenAt.getTime() > SLIDE_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, token));
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email,
    name: row.name,
    role: row.role,
    phone: row.phone,
    shopSlug: row.shopSlug,
    emailVerifiedAt: row.emailVerifiedAt,
  };
}

/** Destroy the current session (logout). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
    store.delete(COOKIE);
  }
}

/** Invalidate every session for a user. Called on a security event (password
 *  reset, role change) so an old cookie can't outlive the change. */
export async function deleteUserSessions(userId: string): Promise<{ deleted: number }> {
  const res = await db.delete(sessions).where(eq(sessions.userId, userId));
  return { deleted: res.rowsAffected };
}

/**
 * A user's live sessions, newest activity first, flagging which one is making
 * this request so the UI can label it "questo dispositivo".
 */
export async function listUserSessions(userId: string) {
  const store = await cookies();
  const current = store.get(COOKIE)?.value;
  const rows = await db
    .select({
      id: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));

  // Never hand a raw session token to the UI — it is a bearer credential. The
  // caller only needs to know which row is the current one.
  return rows.map(({ id, userAgent, ...rest }) => ({
    ...rest,
    device: describeUserAgent(userAgent),
    isCurrent: id === current,
  }));
}

/**
 * Turn a raw user-agent into something a customer can recognise.
 *
 * Deliberately crude, and deliberately done at read time rather than stored: the
 * question this answers is only "is one of these not me?", which needs a browser
 * and a platform, not a version matrix. Parsing at read time also means the
 * heuristics can be improved without a backfill.
 */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Dispositivo sconosciuto";
  const browser =
    /\bEdg\//.test(ua) ? "Edge"
    : /\bOPR\/|\bOpera\b/.test(ua) ? "Opera"
    : /\bFirefox\//.test(ua) ? "Firefox"
    // Chrome's UA contains "Safari", so Chrome has to be ruled out first.
    : /\bChrome\/|\bCriOS\//.test(ua) ? "Chrome"
    : /\bSafari\//.test(ua) ? "Safari"
    : "Browser";
  const platform =
    /\biPhone\b/.test(ua) ? "iPhone"
    : /\biPad\b/.test(ua) ? "iPad"
    : /\bAndroid\b/.test(ua) ? "Android"
    : /\bWindows\b/.test(ua) ? "Windows"
    : /\bMac OS X\b/.test(ua) ? "Mac"
    : /\bLinux\b/.test(ua) ? "Linux"
    : null;
  return platform ? `${browser} su ${platform}` : browser;
}

/**
 * Sign out everywhere except the device making this request — the standard
 * response to "I think someone else has my password".
 */
export async function deleteOtherUserSessions(userId: string): Promise<{ deleted: number }> {
  const store = await cookies();
  const current = store.get(COOKIE)?.value;
  const where = current
    ? and(eq(sessions.userId, userId), ne(sessions.id, current))
    : eq(sessions.userId, userId);
  const res = await db.delete(sessions).where(where);
  return { deleted: res.rowsAffected };
}

/** Garbage-collect expired session rows. Run periodically from the cron sweep. */
export async function deleteExpiredSessions(): Promise<{ deleted: number }> {
  const res = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { deleted: res.rowsAffected };
}

/** Throw-if-absent helpers for gated routes. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "admin" && user.role !== "staff")) throw new Error("FORBIDDEN");
  return user;
}

/** Require one of the given roles (defence-in-depth for admin-only surfaces). */
export async function requireRole(...roles: SessionUser["role"][]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

/** True when the current user is a full admin (not just staff). */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin";
}
