import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, type UserRow } from "@/lib/db/schema";
import { env } from "@/lib/env";

const COOKIE = "taccalite_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days absolute cap
const IDLE_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 7; // 7 days of inactivity
// Only rewrite `lastSeenAt` when it's older than this, so a busy session doesn't
// cause a DB write on every single request (write-amplification on SQLite).
const SLIDE_INTERVAL_MS = 1000 * 60 * 60; // 1 hour

export type SessionUser = Pick<UserRow, "id" | "username" | "email" | "name" | "role" | "phone">;

/** Create a fresh session for a user and set the cookie. A new opaque token is
 *  minted on every login, so credentials never bind to a pre-existing token. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAX_AGE_SEC * 1000);
  await db.insert(sessions).values({ id: token, userId, expiresAt, lastSeenAt: now });

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
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.id, token),
        gt(sessions.expiresAt, now),
        gt(sessions.lastSeenAt, idleCutoff),
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
  return { deleted: res.changes ?? 0 };
}

/** Garbage-collect expired session rows. Run periodically from the cron sweep. */
export async function deleteExpiredSessions(): Promise<{ deleted: number }> {
  const res = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { deleted: res.changes ?? 0 };
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
