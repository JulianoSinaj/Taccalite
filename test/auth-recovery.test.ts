import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, authTokens, orders, loyaltyAccounts, settings, shops } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  issueToken,
  consumeToken,
  inspectToken,
  revokeTokens,
  deleteExpiredAuthTokens,
} from "@/lib/auth/tokens";
import {
  deriveUsername,
  loginUser,
  requestPasswordReset,
  resetPassword,
  verifyEmailToken,
  changePassword,
} from "@/lib/auth/service";
import { claimGuestOrders, countClaimableOrders } from "@/lib/auth/claim";
import { getOrCreateLoyaltyAccount } from "@/lib/loyalty";

// `createSession` reaches for next/headers cookies(), which has no request scope
// under vitest. The flows under test are about tokens and rows, not cookies.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

const PASSWORD = "correct-horse-battery";
const USER_ID = "auth-rec-user";
const EMAIL = "recovery@example.it";

async function seedUser(over: Partial<typeof users.$inferInsert> = {}) {
  await db.delete(users).where(eq(users.id, USER_ID));
  await db.insert(users).values({
    id: USER_ID,
    username: "rec-flow",
    email: EMAIL,
    name: "Recovery Flow",
    passwordHash: hashPassword(PASSWORD),
    role: "customer",
    ...over,
  });
  return USER_ID;
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: "centro", name: "Taccalite Centro", specialty: "Porchetta", phone: "071 000000" })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(settings)
    .values({ key: "loyalty.pointsPerEuro", value: 1 })
    .onConflictDoNothing({ target: settings.key });
});

beforeEach(async () => {
  await db.delete(orders).where(eq(orders.email, EMAIL));
  await db.delete(users).where(eq(users.id, USER_ID));
});

describe("auth tokens", () => {
  it("stores only a hash, never the token itself", async () => {
    await seedUser();
    const { token } = await issueToken(USER_ID, "password_reset", EMAIL);
    const rows = await db.select().from(authTokens).where(eq(authTokens.userId, USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].tokenHash).toHaveLength(64); // sha-256 hex
  });

  it("can be spent exactly once", async () => {
    await seedUser();
    const { token } = await issueToken(USER_ID, "password_reset", EMAIL);
    expect(await consumeToken(token, "password_reset")).toMatchObject({ userId: USER_ID });
    expect(await consumeToken(token, "password_reset")).toBeNull();
    expect(await inspectToken(token, "password_reset")).toBe("used");
  });

  it("refuses a token presented for the wrong purpose", async () => {
    await seedUser();
    const { token } = await issueToken(USER_ID, "email_verify", EMAIL);
    expect(await consumeToken(token, "password_reset")).toBeNull();
    // Still spendable for what it was actually issued for.
    expect(await consumeToken(token, "email_verify")).toMatchObject({ userId: USER_ID });
  });

  it("refuses an expired token and collects it", async () => {
    await seedUser();
    const { token } = await issueToken(USER_ID, "password_reset", EMAIL);
    await db
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.userId, USER_ID));

    expect(await consumeToken(token, "password_reset")).toBeNull();
    expect(await inspectToken(token, "password_reset")).toBe("expired");

    const { deleted } = await deleteExpiredAuthTokens();
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await inspectToken(token, "password_reset")).toBe("unknown");
  });

  it("supersedes the previous token of the same purpose", async () => {
    await seedUser();
    const first = await issueToken(USER_ID, "password_reset", EMAIL);
    const second = await issueToken(USER_ID, "password_reset", EMAIL);
    // Re-sending the email must not leave the earlier link alive — that is the
    // moment a customer is most likely to be reacting to a suspicious message.
    expect(await consumeToken(first.token, "password_reset")).toBeNull();
    expect(await consumeToken(second.token, "password_reset")).toMatchObject({ userId: USER_ID });
  });

  it("revokes outstanding tokens on demand", async () => {
    await seedUser();
    const { token } = await issueToken(USER_ID, "password_reset", EMAIL);
    await revokeTokens(USER_ID, "password_reset");
    expect(await consumeToken(token, "password_reset")).toBeNull();
  });
});

describe("password reset", () => {
  it("is silent about whether an address is registered", async () => {
    await seedUser();
    // Neither call throws or returns anything the route could branch on: the
    // endpoint's fixed response is what keeps this from being a membership oracle.
    await expect(requestPasswordReset("nobody-here@example.it")).resolves.toBeUndefined();
    await expect(requestPasswordReset(EMAIL)).resolves.toBeUndefined();

    const [row] = await db
      .select()
      .from(authTokens)
      .where(and(eq(authTokens.userId, USER_ID), eq(authTokens.purpose, "password_reset")));
    expect(row).toBeTruthy(); // ...but a token really was issued for the real one
  });

  it("sets the new password, verifies the address and clears a lockout", async () => {
    await seedUser({ failedLoginCount: 10, lockedUntil: new Date(Date.now() + 600_000) });
    const { token } = await issueToken(USER_ID, "password_reset", EMAIL);

    const res = await resetPassword({ token, password: "brand-new-password" });
    expect(res.ok).toBe(true);

    const [row] = await db.select().from(users).where(eq(users.id, USER_ID));
    expect(row.failedLoginCount).toBe(0);
    expect(row.lockedUntil).toBeNull();
    // Redeeming a mailed link proves the address, so it counts as verification.
    expect(row.emailVerifiedAt).not.toBeNull();

    expect(await loginUser({ identifier: EMAIL, password: "brand-new-password" })).toMatchObject({
      ok: true,
    });
    expect(await loginUser({ identifier: EMAIL, password: PASSWORD })).toMatchObject({ ok: false });
  });

  it("rejects a reused or unknown link", async () => {
    await seedUser();
    const { token } = await issueToken(USER_ID, "password_reset", EMAIL);
    expect((await resetPassword({ token, password: "brand-new-password" })).ok).toBe(true);
    expect(await resetPassword({ token, password: "another-password" })).toMatchObject({ ok: false });
    expect(await resetPassword({ token: "garbage", password: "another-password" })).toMatchObject({
      ok: false,
    });
  });
});

describe("change password", () => {
  it("requires the current password", async () => {
    await seedUser();
    expect(
      await changePassword(USER_ID, { currentPassword: "wrong", password: "new-password-here" }),
    ).toMatchObject({ ok: false });
    expect(
      await changePassword(USER_ID, { currentPassword: PASSWORD, password: "new-password-here" }),
    ).toMatchObject({ ok: true });
    expect(await loginUser({ identifier: EMAIL, password: "new-password-here" })).toMatchObject({
      ok: true,
    });
  });
});

describe("login identifier and lockout", () => {
  it("accepts either the email or the legacy username", async () => {
    await seedUser();
    expect(await loginUser({ identifier: EMAIL, password: PASSWORD })).toMatchObject({ ok: true });
    expect(await loginUser({ identifier: "rec-flow", password: PASSWORD })).toMatchObject({ ok: true });
    expect(await loginUser({ identifier: EMAIL.toUpperCase(), password: PASSWORD })).toMatchObject({
      ok: true,
    });
  });

  it("stamps lastLoginAt and resets the failure counter on success", async () => {
    await seedUser({ failedLoginCount: 3 });
    await loginUser({ identifier: EMAIL, password: PASSWORD });
    const [row] = await db.select().from(users).where(eq(users.id, USER_ID));
    expect(row.lastLoginAt).not.toBeNull();
    expect(row.failedLoginCount).toBe(0);
  });

  it("locks the account after repeated failures, then lets a reset through", async () => {
    await seedUser();
    for (let i = 0; i < 10; i++) {
      await loginUser({ identifier: EMAIL, password: "nope" });
    }
    const [locked] = await db.select().from(users).where(eq(users.id, USER_ID));
    expect(locked.failedLoginCount).toBeGreaterThanOrEqual(10);
    expect(locked.lockedUntil).not.toBeNull();

    // Even the correct password is refused while the lock stands...
    expect(await loginUser({ identifier: EMAIL, password: PASSWORD })).toMatchObject({ ok: false });

    // ...but the mailbox is always a way through, which is what keeps the lock
    // from being a denial-of-service against the account's own owner.
    const { token } = await issueToken(USER_ID, "password_reset", EMAIL);
    expect((await resetPassword({ token, password: "post-lock-password" })).ok).toBe(true);
    expect(await loginUser({ identifier: EMAIL, password: "post-lock-password" })).toMatchObject({
      ok: true,
    });
  });

  it("does not leak which identifiers exist", async () => {
    await seedUser();
    const missing = await loginUser({ identifier: "ghost@example.it", password: "nope" });
    const wrong = await loginUser({ identifier: EMAIL, password: "nope" });
    expect(missing).toMatchObject({ ok: false, error: "Credenziali non corrette" });
    expect(wrong).toMatchObject({ ok: false, error: "Credenziali non corrette" });
  });
});

describe("deriveUsername", () => {
  it("builds a handle from the email local part", async () => {
    expect(await deriveUsername("mario.rossi@example.it")).toBe("mario-rossi");
  });

  it("suffixes on collision instead of failing", async () => {
    await seedUser({ username: "mario-rossi" });
    expect(await deriveUsername("mario.rossi@altro.it")).toBe("mario-rossi2");
  });

  it("survives a local part with nothing usable in it", async () => {
    const handle = await deriveUsername("--@example.it");
    expect(handle.length).toBeGreaterThanOrEqual(3);
    expect(handle).toMatch(/^[a-z0-9._-]+$/);
  });
});

describe("claiming guest orders", () => {
  async function guestOrder(over: Partial<typeof orders.$inferInsert> = {}) {
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: `ORD-CLAIM-${Math.random().toString(36).slice(2, 8)}`,
        email: EMAIL,
        name: "Recovery Flow",
        subtotalCents: 2500,
        totalCents: 2500,
        status: "paid",
        paymentStatus: "paid",
        shopSlug: "centro",
        ...over,
      })
      .returning({ id: orders.id });
    return row.id;
  }

  it("counts and then attaches unowned orders, crediting points once", async () => {
    await seedUser();
    await getOrCreateLoyaltyAccount(USER_ID);
    await guestOrder();
    await guestOrder();

    expect(await countClaimableOrders(EMAIL)).toBe(2);

    const first = await claimGuestOrders(USER_ID, EMAIL);
    expect(first.orders).toBe(2);
    expect(first.points).toBe(50); // 2 × €25 at 1 point/euro

    // Idempotent: the userId write is the guard, so a second click claims nothing.
    const second = await claimGuestOrders(USER_ID, EMAIL);
    expect(second).toEqual({ orders: 0, points: 0 });

    const [account] = await db
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.userId, USER_ID));
    expect(account.points).toBe(50);
  });

  it("attaches a refunded order but pays no points for it", async () => {
    await seedUser();
    await getOrCreateLoyaltyAccount(USER_ID);
    await guestOrder({ paymentStatus: "refunded", status: "refunded" });

    const res = await claimGuestOrders(USER_ID, EMAIL);
    expect(res.orders).toBe(1);
    expect(res.points).toBe(0);
  });

  it("never claims an order that already belongs to somebody", async () => {
    await seedUser();
    const otherId = "auth-rec-other";
    await db.delete(users).where(eq(users.id, otherId));
    await db.insert(users).values({
      id: otherId,
      username: "rec-other",
      email: "other@example.it",
      name: "Other",
      passwordHash: hashPassword(PASSWORD),
    });
    await guestOrder({ userId: otherId });

    expect(await countClaimableOrders(EMAIL)).toBe(0);
    expect(await claimGuestOrders(USER_ID, EMAIL)).toEqual({ orders: 0, points: 0 });
    await db.delete(users).where(eq(users.id, otherId));
  });

  it("respects the lookback window", async () => {
    await seedUser();
    await getOrCreateLoyaltyAccount(USER_ID);
    const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    await guestOrder({ createdAt: old });
    await guestOrder();

    // Default lookback is 365 days, so only the recent order is in range.
    expect(await countClaimableOrders(EMAIL)).toBe(1);
    expect((await claimGuestOrders(USER_ID, EMAIL)).orders).toBe(1);
  });
});

describe("email verification", () => {
  it("stamps the address, claims past orders and cannot be replayed", async () => {
    await seedUser({ emailVerifiedAt: null });
    await getOrCreateLoyaltyAccount(USER_ID);
    await db.insert(orders).values({
      orderNumber: `ORD-VERIFY-${Math.random().toString(36).slice(2, 8)}`,
      email: EMAIL,
      name: "Recovery Flow",
      subtotalCents: 1000,
      totalCents: 1000,
      status: "paid",
      paymentStatus: "paid",
      shopSlug: "centro",
    });

    const { token } = await issueToken(USER_ID, "email_verify", EMAIL);
    const res = await verifyEmailToken(token);
    expect(res).toMatchObject({ ok: true, claimed: { orders: 1, points: 10 } });

    const [row] = await db.select().from(users).where(eq(users.id, USER_ID));
    expect(row.emailVerifiedAt).not.toBeNull();

    expect(await verifyEmailToken(token)).toMatchObject({ ok: false });
  });

  it("writes the address carried by the token, so an email change verifies first", async () => {
    await seedUser({ emailVerifiedAt: null });
    const changed = "nuovo-indirizzo@example.it";
    const { token } = await issueToken(USER_ID, "email_verify", changed);

    expect(await verifyEmailToken(token)).toMatchObject({ ok: true });
    const [row] = await db.select().from(users).where(eq(users.id, USER_ID));
    expect(row.email).toBe(changed);

    await db.delete(orders).where(inArray(orders.email, [changed]));
  });

  it("refuses when another account has taken the address in the meantime", async () => {
    await seedUser({ emailVerifiedAt: null });
    const wanted = "conteso@example.it";
    const { token } = await issueToken(USER_ID, "email_verify", wanted);

    const squatterId = "auth-rec-squatter";
    await db.delete(users).where(eq(users.id, squatterId));
    await db.insert(users).values({
      id: squatterId,
      username: "rec-squatter",
      email: wanted,
      name: "Squatter",
      passwordHash: hashPassword(PASSWORD),
    });

    expect(await verifyEmailToken(token)).toMatchObject({ ok: false });
    await db.delete(users).where(eq(users.id, squatterId));
  });
});
