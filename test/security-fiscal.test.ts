import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// A successful login writes the session cookie, which needs Next's request
// scope. Stub it with an in-memory jar so the auth path can be exercised here.
vi.mock("next/headers", () => {
  const jar = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined),
      set: (k: string, v: string) => void jar.set(k, v),
      delete: (k: string) => void jar.delete(k),
    }),
  };
});

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, orders, orderItems, settings, users } from "@/lib/db/schema";
import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  consumeRecoveryCode,
  remainingRecoveryCodes,
  toStored,
} from "@/lib/auth/recovery-codes";
import { buildFatturaXml, type FiscalIdentity } from "@/lib/fattura";
import { getVatReport } from "@/lib/admin/queries";
import { hashPassword } from "@/lib/auth/password";
import { loginUser } from "@/lib/auth/service";

const SHOP = "fisc-shop";

const FISCAL: FiscalIdentity = {
  legalName: "Norcineria Test",
  vatNumber: "01234567890",
  taxCode: "01234567890",
  address: "Via Roma 1",
  zip: "60121",
  city: "Ancona",
  province: "AN",
  regime: "Ordinario",
};

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Fiscale", specialty: "Test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(settings)
    .values({ key: "store.shippingVatRate", value: 22 })
    .onConflictDoUpdate({ target: settings.key, set: { value: 22 } });
});

describe("recovery codes", () => {
  it("generates distinct codes from an unambiguous alphabet", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    // No 0/O/1/I/L — they get mis-transcribed off a printout.
    for (const c of codes) expect(c).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}-[A-HJ-KM-NP-Z2-9]{5}$/);
  });

  it("accepts a code typed in lowercase, without the dash, or with spaces", () => {
    const [code] = generateRecoveryCodes(1);
    const stored = toStored([code]);
    const messy = ` ${code.toLowerCase().replace("-", " ")} `;
    expect(consumeRecoveryCode(stored, messy)).not.toBeNull();
    expect(normalizeRecoveryCode(messy)).toBe(code.replace("-", ""));
  });

  it("spends a code exactly once", () => {
    const codes = generateRecoveryCodes(3);
    const stored = toStored(codes);
    expect(remainingRecoveryCodes(stored)).toBe(3);

    const after = consumeRecoveryCode(stored, codes[0]);
    expect(after).not.toBeNull();
    expect(remainingRecoveryCodes(after)).toBe(2);
    // The same code can't be replayed against the updated array.
    expect(consumeRecoveryCode(after, codes[0])).toBeNull();
    // A different code still works.
    expect(consumeRecoveryCode(after, codes[1])).not.toBeNull();
  });

  it("rejects an unknown code and an empty store", () => {
    const stored = toStored(generateRecoveryCodes(2));
    expect(consumeRecoveryCode(stored, "ZZZZZ-ZZZZZ")).toBeNull();
    expect(consumeRecoveryCode(stored, "")).toBeNull();
    expect(consumeRecoveryCode(null, "ZZZZZ-ZZZZZ")).toBeNull();
  });
});

describe("login with a recovery code", () => {
  const USERNAME = "rec-user";

  beforeEach(async () => {
    await db.delete(users).where(eq(users.username, USERNAME));
  });

  it("lets a valid recovery code stand in for the TOTP code, once", async () => {
    const codes = generateRecoveryCodes(2);
    await db.insert(users).values({
      username: USERNAME,
      name: "Recovery",
      passwordHash: hashPassword("password123"),
      role: "admin",
      totpEnabled: true,
      // A secret that will never match the supplied code, forcing the fallback.
      totpSecret: "JBSWY3DPEHPK3PXP",
      totpRecoveryCodes: toStored(codes),
    });

    const first = await loginUser({ identifier: USERNAME, password: "password123", code: codes[0] });
    expect(first.ok).toBe(true);

    // Spent: the same code must not work a second time.
    const replay = await loginUser({ identifier: USERNAME, password: "password123", code: codes[0] });
    expect(replay).toMatchObject({ ok: false, twoFactorRequired: true });

    const [row] = await db.select().from(users).where(eq(users.username, USERNAME));
    expect(remainingRecoveryCodes(row.totpRecoveryCodes)).toBe(1);
  });

  it("still rejects a wrong code", async () => {
    await db.insert(users).values({
      username: USERNAME,
      name: "Recovery",
      passwordHash: hashPassword("password123"),
      role: "admin",
      totpEnabled: true,
      totpSecret: "JBSWY3DPEHPK3PXP",
      totpRecoveryCodes: toStored(generateRecoveryCodes(2)),
    });
    const res = await loginUser({ identifier: USERNAME, password: "password123", code: "NOPE1-NOPE2" });
    expect(res).toMatchObject({ ok: false, twoFactorRequired: true });
  });
});

describe("FatturaPA buyer identity", () => {
  const order = (over: Partial<typeof orders.$inferSelect> = {}) =>
    ({
      id: "o1",
      orderNumber: "ORD-2026-000001",
      name: "Mario Rossi",
      email: "m@x.it",
      subtotalCents: 1000,
      shippingCents: 0,
      discountCents: 0,
      totalCents: 1000,
      shippingAddress: { address: "Via Test 2", city: "Ancona", zip: "60121" },
      createdAt: new Date("2026-03-01T10:00:00Z"),
      paidAt: null,
      customerTaxCode: null,
      customerVatNumber: null,
      customerSdiCode: null,
      customerPec: null,
      ...over,
    }) as typeof orders.$inferSelect;

  const items = [
    { id: "i1", orderId: "o1", name: "Porchetta", quantity: 1, unitPriceCents: 1000, lineTotalCents: 1000, vatRateBps: 1000, productId: null, productSlug: null },
  ] as (typeof orderItems.$inferSelect)[];

  it("falls back to the catch-all SdI code for a private customer", () => {
    const xml = buildFatturaXml(order({ customerTaxCode: "rssmra80a01h501u" }), items, FISCAL, "00001");
    expect(xml).toContain("<CodiceDestinatario>0000000</CodiceDestinatario>");
    // Normalised to the uppercase form SdI expects.
    expect(xml).toContain("<CodiceFiscale>RSSMRA80A01H501U</CodiceFiscale>");
  });

  it("emits the buyer's VAT number and recipient code for a business", () => {
    const xml = buildFatturaXml(
      order({ customerVatNumber: "IT 09876543210", customerSdiCode: "abc1234" }),
      items,
      FISCAL,
      "00001",
    );
    expect(xml).toContain("<CodiceDestinatario>ABC1234</CodiceDestinatario>");
    expect(xml).toContain("<IdCodice>IT09876543210</IdCodice>");
  });

  it("adds a PEC destination when supplied", () => {
    const xml = buildFatturaXml(order({ customerPec: "azienda@pec.it" }), items, FISCAL, "00001");
    expect(xml).toContain("<PECDestinatario>azienda@pec.it</PECDestinatario>");
  });

  it("ignores a recipient code of the wrong length", () => {
    const xml = buildFatturaXml(order({ customerSdiCode: "AB12" }), items, FISCAL, "00001");
    expect(xml).toContain("<CodiceDestinatario>0000000</CodiceDestinatario>");
  });

  it("dates the invoice by payment, not by when the order was placed", () => {
    const xml = buildFatturaXml(
      order({ paidAt: new Date("2026-04-02T09:00:00Z") }),
      items,
      FISCAL,
      "00001",
    );
    expect(xml).toContain("<Data>2026-04-02</Data>");
  });
});

describe("getVatReport periods", () => {
  const NUMBERS = ["VP-1", "VP-2"];

  beforeEach(async () => {
    const rows = await db.select({ id: orders.id }).from(orders).where(inArray(orders.orderNumber, NUMBERS));
    if (rows.length) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, rows.map((r) => r.id)));
    }
    await db.delete(orders).where(inArray(orders.orderNumber, NUMBERS));
  });

  it("places an order in the period it was paid, not the one it was created in", async () => {
    // Placed 31 March, paid 1 April → belongs to April.
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: "VP-1",
        email: "a@x.it",
        name: "A",
        status: "paid",
        paymentStatus: "paid",
        shopSlug: SHOP,
        subtotalCents: 1100,
        totalCents: 1100,
        createdAt: new Date("2026-03-31T22:00:00Z"),
        paidAt: new Date("2026-04-01T09:00:00Z"),
      })
      .returning({ id: orders.id });
    await db.insert(orderItems).values({
      orderId: row.id, name: "X", quantity: 1, unitPriceCents: 1100, lineTotalCents: 1100, vatRateBps: 1000,
    });

    const march = await getVatReport(new Date("2026-03-01"), new Date("2026-03-31T23:59:59"));
    expect(march.buckets).toHaveLength(0);

    const april = await getVatReport(new Date("2026-04-01"), new Date("2026-04-30T23:59:59"));
    expect(april.buckets.reduce((s, b) => s + b.grossCents, 0)).toBe(1100);
  });

  it("falls back to the creation date for orders paid before paidAt existed", async () => {
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: "VP-2",
        email: "b@x.it",
        name: "B",
        status: "paid",
        paymentStatus: "paid",
        shopSlug: SHOP,
        subtotalCents: 2200,
        totalCents: 2200,
        createdAt: new Date("2026-05-10T10:00:00Z"),
        paidAt: null, // legacy row
      })
      .returning({ id: orders.id });
    await db.insert(orderItems).values({
      orderId: row.id, name: "Y", quantity: 1, unitPriceCents: 2200, lineTotalCents: 2200, vatRateBps: 2200,
    });

    const may = await getVatReport(new Date("2026-05-01"), new Date("2026-05-31T23:59:59"));
    expect(may.buckets.reduce((s, b) => s + b.grossCents, 0)).toBe(2200);
  });
});
