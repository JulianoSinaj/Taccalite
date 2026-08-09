import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, orders, users, newsletterSubscribers } from "@/lib/db/schema";
import { getOrdersPage, getCustomersPage, getSubscribersPage } from "@/lib/admin/queries";
import { orderFilters, customerFilters, subscriberFilters } from "@/lib/admin/filters";
import { usesFts, verifySearchIndexes, FTS_TABLES } from "@/lib/admin/search";

const SHOP = "fts-shop";
const NUMBERS = ["FTS-100", "FTS-200", "FTS-300"];

const numbers = (rows: { orderNumber: string }[]) =>
  rows.map((r) => r.orderNumber).filter((n) => NUMBERS.includes(n)).sort();

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Ricerca", specialty: "Test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  await db.delete(orders).where(inArray(orders.orderNumber, NUMBERS));
  await db.insert(orders).values([
    { orderNumber: "FTS-100", email: "mario.rossi@example.it", name: "Mario Rossi", shopSlug: SHOP },
    { orderNumber: "FTS-200", email: "anna.bianchi@example.it", name: "Anna Bianchi", shopSlug: SHOP },
    { orderNumber: "FTS-300", email: "carlo.verdi@altro.it", name: "Carlo Verdi", shopSlug: SHOP },
  ]);
});

/** The whole point of the trigram tokenizer: substring semantics are preserved. */
describe("order search via the FTS index", () => {
  it("matches a mid-word substring, exactly as LIKE '%…%' did", async () => {
    const { rows } = await getOrdersPage(orderFilters({ q: "ossi" }));
    expect(numbers(rows)).toEqual(["FTS-100"]);
  });

  it("is case-insensitive", async () => {
    const upper = await getOrdersPage(orderFilters({ q: "BIANCHI" }));
    const lower = await getOrdersPage(orderFilters({ q: "bianchi" }));
    expect(numbers(upper.rows)).toEqual(["FTS-200"]);
    expect(numbers(lower.rows)).toEqual(numbers(upper.rows));
  });

  it("searches across all indexed columns", async () => {
    expect(numbers((await getOrdersPage(orderFilters({ q: "FTS-300" }))).rows)).toEqual(["FTS-300"]);
    expect(numbers((await getOrdersPage(orderFilters({ q: "altro.it" }))).rows)).toEqual(["FTS-300"]);
  });

  it("falls back to LIKE below the trigram minimum and still matches", async () => {
    expect(usesFts("ve")).toBe(false);
    const { rows } = await getOrdersPage(orderFilters({ q: "ve" }));
    // "Verdi" — a 2-char term trigram can't index, served by the LIKE fallback.
    expect(numbers(rows)).toContain("FTS-300");
  });

  it("treats query syntax as literal text rather than FTS operators", async () => {
    // A bare `"` or an operator like OR/NEAR would be a malformed FTS query if
    // it weren't quoted — these must return cleanly, not throw.
    for (const q of ['"', 'rossi OR bianchi', 'NEAR(a b)', 'anna*', "a(b"]) {
      await expect(getOrdersPage(orderFilters({ q }))).resolves.toBeTruthy();
    }
  });

  it("combines with the other facets", async () => {
    const { rows } = await getOrdersPage(orderFilters({ q: "rossi", negozio: SHOP }));
    expect(numbers(rows)).toEqual(["FTS-100"]);
    const none = await getOrdersPage(orderFilters({ q: "rossi", stato: "fulfilled" }));
    expect(numbers(none.rows)).toEqual([]);
  });
});

describe("index stays in sync via triggers", () => {
  it("reflects an update and a delete", async () => {
    // A name token that appears in no other indexed column, so "the old value
    // stopped matching" can't be masked by the email still containing it.
    await db.update(orders).set({ name: "Zeta Qualunque" }).where(eq(orders.orderNumber, "FTS-100"));
    expect(numbers((await getOrdersPage(orderFilters({ q: "qualunque" }))).rows)).toEqual(["FTS-100"]);

    await db.update(orders).set({ name: "Mario Neri" }).where(eq(orders.orderNumber, "FTS-100"));
    expect(numbers((await getOrdersPage(orderFilters({ q: "neri" }))).rows)).toEqual(["FTS-100"]);
    // The superseded value must no longer match — the update trigger deletes the
    // old row from the index before inserting the new one.
    expect(numbers((await getOrdersPage(orderFilters({ q: "qualunque" }))).rows)).toEqual([]);

    await db.delete(orders).where(eq(orders.orderNumber, "FTS-100"));
    expect(numbers((await getOrdersPage(orderFilters({ q: "neri" }))).rows)).toEqual([]);
  });
});

describe("customer search spans the joined loyalty card", () => {
  const USERNAME = "fts-customer";

  beforeEach(async () => {
    await db.delete(users).where(eq(users.username, USERNAME));
    await db.insert(users).values({
      username: USERNAME,
      name: "Giulia Ferrari",
      passwordHash: "x",
      role: "customer",
    });
  });

  it("finds a customer by an indexed column", async () => {
    const { rows } = await getCustomersPage(customerFilters({ q: "errar" }));
    expect(rows.some((r) => r.username === USERNAME)).toBe(true);
  });
});

describe("subscriber search", () => {
  const EMAIL = "fts.subscriber@example.it";

  beforeEach(async () => {
    await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.email, EMAIL));
    await db.insert(newsletterSubscribers).values({ email: EMAIL, token: "t-fts", status: "confirmed" });
  });

  it("matches a substring of the address", async () => {
    const { rows } = await getSubscribersPage(subscriberFilters({ q: "subscriber" }));
    expect(rows.some((r) => r.email === EMAIL)).toBe(true);
  });
});

describe("verifySearchIndexes", () => {
  it("passes the integrity check on every index without rebuilding", async () => {
    const res = await verifySearchIndexes();
    expect(res.checked).toBe(Object.keys(FTS_TABLES).length);
    expect(res.rebuilt).toEqual([]);
  });
});
