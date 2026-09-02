import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  addresses,
  authTokens,
  stockNotifications,
  products,
  shops,
  users,
} from "@/lib/db/schema";
import { gatherUserData, anonymizeUser } from "@/lib/gdpr";
import { hashPassword } from "@/lib/auth/password";

/**
 * What an export must carry, and what it must not.
 *
 * Two opposite failures live in the same function. The export walked past the
 * saved address book — plainly the customer's data — while carrying the TOTP
 * secret and recovery codes, which are credentials and have no business in a
 * file that gets downloaded, emailed and dropped in a cloud folder. And erasure
 * left both the address book and that secret behind.
 */

const EMAIL = "gdpr-subject@example.com";
const SHOP = "gdpr-shop";
let userId = "";
let productId = "";

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Sede GDPR", specialty: "test" })
    .onConflictDoNothing({ target: shops.slug });
  const [p] = await db
    .insert(products)
    .values({ slug: "gdpr-prod", name: "Prodotto", shopSlug: SHOP, priceCents: 100 })
    .onConflictDoNothing({ target: products.slug })
    .returning({ id: products.id });
  productId =
    p?.id ??
    (await db.select({ id: products.id }).from(products).where(eq(products.slug, "gdpr-prod")))[0]!.id;
});

beforeEach(async () => {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  for (const u of existing) {
    await db.delete(addresses).where(eq(addresses.userId, u.id));
    await db.delete(authTokens).where(eq(authTokens.userId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  await db.delete(stockNotifications).where(eq(stockNotifications.email, EMAIL));

  const [u] = await db
    .insert(users)
    .values({
      username: "gdpr-subject",
      email: EMAIL,
      name: "Soggetto",
      passwordHash: hashPassword("Password!234"),
      role: "customer",
      totpEnabled: true,
      totpSecret: "JBSWY3DPEHPK3PXP",
      totpRecoveryCodes: ["hash-a", "hash-b"],
    })
    .returning({ id: users.id });
  userId = u!.id;

  await db.insert(addresses).values({
    userId,
    label: "Casa",
    name: "Soggetto",
    street: "Via della Prova 1",
    city: "Ancona",
    postcode: "60100",
  });
  await db.insert(stockNotifications).values({ productId, email: EMAIL });
  await db.insert(authTokens).values({
    userId,
    purpose: "password_reset",
    tokenHash: "deadbeef",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
});

describe("gatherUserData", () => {
  it("includes the saved address book", async () => {
    const data = await gatherUserData(userId);
    expect(data!.addresses).toHaveLength(1);
    expect(data!.addresses[0]!.street).toBe("Via della Prova 1");
  });

  it("includes the records keyed by email rather than by account id", async () => {
    // These were missed precisely because they hold the address, not the id.
    const data = await gatherUserData(userId);
    expect(data!.stockNotifications).toHaveLength(1);
    expect(Array.isArray(data!.discountRedemptions)).toBe(true);
  });

  it("never carries a credential", async () => {
    const data = await gatherUserData(userId);
    const asJson = JSON.stringify(data);

    expect(asJson).not.toContain("JBSWY3DPEHPK3PXP");
    expect(asJson).not.toContain("hash-a");
    expect("passwordHash" in data!.user).toBe(false);
    expect("totpSecret" in data!.user).toBe(false);
    expect("totpRecoveryCodes" in data!.user).toBe(false);
    // Still the person's own data, though.
    expect(data!.user.name).toBe("Soggetto");
  });
});

describe("anonymizeUser", () => {
  it("deletes the address book rather than leaving it behind", async () => {
    // Unlike an order, a saved delivery address carries no fiscal-retention
    // obligation — there is nothing to weigh against erasing it.
    expect(await anonymizeUser(userId)).toBe(true);
    expect(await db.select().from(addresses).where(eq(addresses.userId, userId))).toHaveLength(0);
  });

  it("takes the second factor with the account", async () => {
    await anonymizeUser(userId);
    const [after] = await db.select().from(users).where(eq(users.id, userId));
    expect(after!.totpEnabled).toBe(false);
    expect(after!.totpSecret).toBeNull();
    expect(after!.totpRecoveryCodes).toBeNull();
  });

  it("kills outstanding reset and verification links", async () => {
    await anonymizeUser(userId);
    expect(await db.select().from(authTokens).where(eq(authTokens.userId, userId))).toHaveLength(0);
  });

  it("stops the back-in-stock waitlist emailing someone who asked to be forgotten", async () => {
    await anonymizeUser(userId);
    expect(
      await db.select().from(stockNotifications).where(eq(stockNotifications.email, EMAIL)),
    ).toHaveLength(0);
  });

  it("still scrubs the account itself", async () => {
    await anonymizeUser(userId);
    const [after] = await db.select().from(users).where(eq(users.id, userId));
    expect(after!.email).toBeNull();
    expect(after!.name).toBe("Cliente rimosso");
    expect(after!.active).toBe(false);
  });
});
