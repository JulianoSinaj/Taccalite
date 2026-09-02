import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("next/headers", () => {
  const jar = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined),
      set: (k: string, v: string) => void jar.set(k, v),
      delete: (k: string) => void jar.delete(k),
    }),
    headers: async () => new Headers(),
  };
});

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginUser } from "@/lib/auth/service";

/**
 * The lockout has to be a budget that refills, not a ratchet.
 *
 * The counter only reset on a *successful* login, so an account that had been
 * locked once stayed pinned at the threshold: the next single wrong password
 * was attempt eleven of ten and locked it again. Ten tries became one try per
 * fifteen minutes, permanently — and anyone who knew the address could hold the
 * account shut with one request every fifteen minutes.
 */

const PASSWORD = "Password!234";
const USERNAME = "lockout-user";
const THRESHOLD = 10;
let userId = "";

const row = async () =>
  (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]!;

const attempt = (password: string) => loginUser({ identifier: USERNAME, password });

/** Pretend the lock ran its course, without waiting a quarter of an hour. */
async function expireLock() {
  await db
    .update(users)
    .set({ lockedUntil: new Date(Date.now() - 1000) })
    .where(eq(users.id, userId));
}

beforeAll(async () => {
  await db
    .insert(users)
    .values({
      username: USERNAME,
      email: "lockout@example.com",
      name: "Lockout",
      passwordHash: hashPassword(PASSWORD),
      role: "customer",
    })
    .onConflictDoNothing({ target: users.username });
  userId = (await db.select().from(users).where(eq(users.username, USERNAME)).limit(1))[0]!.id;
});

beforeEach(async () => {
  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, active: true })
    .where(eq(users.id, userId));
});

describe("login lockout", () => {
  it("locks the account after the threshold is reached", async () => {
    for (let i = 0; i < THRESHOLD; i++) await attempt("wrong");

    const locked = await row();
    expect(locked.failedLoginCount).toBe(THRESHOLD);
    expect(locked.lockedUntil).toBeTruthy();

    // And the right password is refused while the lock stands, so a correct
    // guess cannot be confirmed by trying it.
    const res = await attempt(PASSWORD);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Troppi tentativi/);
  });

  it("gives the whole budget back once the lock has been served", async () => {
    for (let i = 0; i < THRESHOLD; i++) await attempt("wrong");
    await expireLock();

    // One wrong password after a served lock is attempt *one*, not eleven.
    await attempt("wrong");
    const after = await row();
    expect(after.failedLoginCount).toBe(1);
    expect(after.lockedUntil).toBeNull();
  });

  it("does not re-lock on the first mistake after a served lock", async () => {
    for (let i = 0; i < THRESHOLD; i++) await attempt("wrong");
    await expireLock();
    await attempt("wrong");

    // The account is usable again — previously this returned "troppi tentativi"
    // because the single mistake above had re-locked it.
    const res = await attempt(PASSWORD);
    expect(res.ok).toBe(true);
  });

  it("clears the counter entirely on a successful login", async () => {
    await attempt("wrong");
    await attempt("wrong");
    expect((await row()).failedLoginCount).toBe(2);

    expect((await attempt(PASSWORD)).ok).toBe(true);
    const after = await row();
    expect(after.failedLoginCount).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });
});
