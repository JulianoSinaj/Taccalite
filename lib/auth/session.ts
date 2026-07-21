import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, type UserRow } from "@/lib/db/schema";
import { env } from "@/lib/env";

const COOKIE = "taccalite_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export type SessionUser = Pick<UserRow, "id" | "username" | "email" | "name" | "role" | "phone">;

/** Create a session for a user and set the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAX_AGE_SEC * 1000);
  await db.insert(sessions).values({ id: token, userId, expiresAt });

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** Resolve the current session user (or null). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      name: users.name,
      role: users.role,
      phone: users.phone,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return rows[0] ?? null;
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
