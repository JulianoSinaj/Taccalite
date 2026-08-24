import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, orders, shops, settings, addresses, loyaltyAccounts } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  createAddress,
  listAddresses,
  getDefaultAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} from "@/lib/addresses";
import { attachOrderToUser } from "@/lib/auth/claim";
import { getOrCreateLoyaltyAccount } from "@/lib/loyalty";
import { rateLimitDurable, deleteExpiredRateLimits } from "@/lib/rate-limit";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));

const USER_ID = "acct-svc-user";

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: "centro", name: "Taccalite Centro", specialty: "Porchetta" })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(settings)
    .values({ key: "loyalty.pointsPerEuro", value: 1 })
    .onConflictDoNothing({ target: settings.key });
});

beforeEach(async () => {
  await db.delete(users).where(eq(users.id, USER_ID));
  await db.insert(users).values({
    id: USER_ID,
    username: "acct-svc",
    email: "acct-svc@example.it",
    name: "Account Services",
    passwordHash: hashPassword("password12345"),
  });
});

describe("address book", () => {
  it("makes the first address the default whether or not it was asked for", async () => {
    const first = await createAddress(USER_ID, { street: "Via Uno 1", city: "Ancona", postcode: "60121" });
    expect(first.isDefault).toBe(true);

    // A second one does not steal the flag unless it says so.
    const second = await createAddress(USER_ID, { street: "Via Due 2", city: "Ancona", postcode: "60122" });
    expect(second.isDefault).toBe(false);

    const def = await getDefaultAddress(USER_ID);
    expect(def?.street).toBe("Via Uno 1");
  });

  it("keeps exactly one default when another is promoted", async () => {
    const a = await createAddress(USER_ID, { street: "Via A", city: "Ancona", postcode: "60121" });
    const b = await createAddress(USER_ID, { street: "Via B", city: "Ancona", postcode: "60122" });

    await setDefaultAddress(USER_ID, b.id);
    const rows = await listAddresses(USER_ID);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault)?.id).toBe(b.id);
    expect(rows.find((r) => r.id === a.id)?.isDefault).toBe(false);
  });

  it("promotes a survivor when the default is deleted", async () => {
    const a = await createAddress(USER_ID, { street: "Via A", city: "Ancona", postcode: "60121" });
    await createAddress(USER_ID, { street: "Via B", city: "Ancona", postcode: "60122" });

    await deleteAddress(USER_ID, a.id);
    // Otherwise checkout silently stops prefilling for a customer who still has
    // addresses saved.
    const def = await getDefaultAddress(USER_ID);
    expect(def).not.toBeNull();
    expect(def?.street).toBe("Via B");
  });

  it("refuses to touch another user's address on id alone", async () => {
    const mine = await createAddress(USER_ID, { street: "Via Mia", city: "Ancona", postcode: "60121" });

    const otherId = "acct-svc-other";
    await db.delete(users).where(eq(users.id, otherId));
    await db.insert(users).values({
      id: otherId,
      username: "acct-svc-other",
      name: "Other",
      passwordHash: hashPassword("password12345"),
    });

    expect(await updateAddress(otherId, mine.id, { street: "Dirottata" })).toBe(false);
    expect(await deleteAddress(otherId, mine.id)).toBe(false);
    expect(await setDefaultAddress(otherId, mine.id)).toBe(false);

    const [still] = await db.select().from(addresses).where(eq(addresses.id, mine.id));
    expect(still.street).toBe("Via Mia");
    await db.delete(users).where(eq(users.id, otherId));
  });
});

describe("attaching a single order by token", () => {
  async function guestOrder(over: Partial<typeof orders.$inferInsert> = {}) {
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: `ORD-ATT-${Math.random().toString(36).slice(2, 8)}`,
        email: "someone-else@example.it",
        name: "Guest",
        subtotalCents: 3000,
        totalCents: 3000,
        status: "paid",
        paymentStatus: "paid",
        shopSlug: "centro",
        ...over,
      })
      .returning({ id: orders.id });
    return row.id;
  }

  it("attaches once and credits the order's points", async () => {
    await getOrCreateLoyaltyAccount(USER_ID);
    const id = await guestOrder();

    const first = await attachOrderToUser(id, USER_ID);
    expect(first).toEqual({ attached: true, points: 30 });

    // Second call is a no-op — the userId write is the guard.
    expect(await attachOrderToUser(id, USER_ID)).toEqual({ attached: false, points: 0 });

    const [account] = await db
      .select()
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.userId, USER_ID));
    expect(account.points).toBe(30);
  });

  it("pays nothing for an order that has not settled", async () => {
    await getOrCreateLoyaltyAccount(USER_ID);
    const id = await guestOrder({ paymentStatus: "unpaid", status: "pending" });
    expect(await attachOrderToUser(id, USER_ID)).toEqual({ attached: true, points: 0 });
  });

  it("cannot steal an order that already has an owner", async () => {
    const otherId = "acct-svc-owner";
    await db.delete(users).where(eq(users.id, otherId));
    await db.insert(users).values({
      id: otherId,
      username: "acct-svc-owner",
      name: "Owner",
      passwordHash: hashPassword("password12345"),
    });
    const id = await guestOrder({ userId: otherId });

    expect(await attachOrderToUser(id, USER_ID)).toEqual({ attached: false, points: 0 });
    const [row] = await db.select().from(orders).where(eq(orders.id, id));
    expect(row.userId).toBe(otherId);
    await db.delete(users).where(eq(users.id, otherId));
  });
});

describe("durable rate limiter", () => {
  it("counts across calls and refuses past the limit", async () => {
    const key = `test-durable-${Math.random().toString(36).slice(2)}`;
    const opts = { limit: 3, windowMs: 60_000 };

    expect((await rateLimitDurable(key, opts)).ok).toBe(true);
    expect((await rateLimitDurable(key, opts)).ok).toBe(true);
    expect((await rateLimitDurable(key, opts)).ok).toBe(true);

    const blocked = await rateLimitDurable(key, opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("starts a fresh window once the old one has expired", async () => {
    const key = `test-durable-exp-${Math.random().toString(36).slice(2)}`;
    // A window already in the past: the next call must reset rather than
    // accumulate, or a bucket would stay poisoned for ever.
    expect((await rateLimitDurable(key, { limit: 1, windowMs: -1000 })).ok).toBe(true);
    expect((await rateLimitDurable(key, { limit: 1, windowMs: -1000 })).ok).toBe(true);
  });

  it("keeps separate keys separate", async () => {
    const a = `test-durable-a-${Math.random().toString(36).slice(2)}`;
    const b = `test-durable-b-${Math.random().toString(36).slice(2)}`;
    await rateLimitDurable(a, { limit: 1, windowMs: 60_000 });
    expect((await rateLimitDurable(a, { limit: 1, windowMs: 60_000 })).ok).toBe(false);
    expect((await rateLimitDurable(b, { limit: 1, windowMs: 60_000 })).ok).toBe(true);
  });

  it("collects expired windows", async () => {
    const key = `test-durable-gc-${Math.random().toString(36).slice(2)}`;
    await rateLimitDurable(key, { limit: 5, windowMs: -1000 });
    const { deleted } = await deleteExpiredRateLimits();
    expect(deleted).toBeGreaterThanOrEqual(1);
  });
});

describe("describeUserAgent", () => {
  // This function shipped broken once: an editing slip wrote the `\b` word
  // boundaries as literal backspace characters (0x08), so every pattern failed to
  // match and every device read "Browser". tsc, eslint and the whole suite stayed
  // green — the control characters are invisible in a terminal, and "Browser"
  // looks exactly like a legitimate fallback. Hence a test that asserts real
  // strings resolve, plus one that refuses control characters in the source.
  it("names the browser and platform for real user agents", async () => {
    const { describeUserAgent } = await import("@/lib/auth/session");
    const cases: [string, string][] = [
      [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Safari su iPhone",
      ],
      [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Chrome su Windows",
      ],
      [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        "Edge su Mac",
      ],
      [
        "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
        "Firefox su Linux",
      ],
      [
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        "Chrome su Android",
      ],
    ];
    for (const [ua, expected] of cases) expect(describeUserAgent(ua)).toBe(expected);
  });

  it("falls back without throwing on junk", async () => {
    const { describeUserAgent } = await import("@/lib/auth/session");
    expect(describeUserAgent(null)).toBe("Dispositivo sconosciuto");
    expect(describeUserAgent("")).toBe("Dispositivo sconosciuto");
    expect(describeUserAgent("curl/8.18.0")).toBe("Browser");
  });

  it("has no stray control characters in its source", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile("lib/auth/session.ts", "utf8");
    // Tab, newline and carriage return are legitimate; anything else in the C0
    // range got there by accident and is invisible in every diff view.
    const stray = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
    expect(stray.test(src)).toBe(false);
  });
});
