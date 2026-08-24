import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, settings, stockMovements } from "@/lib/db/schema";
import { createOrder } from "@/lib/orders";
import { porchettaCutoffFor } from "@/lib/reservations";

/**
 * Guards on money that has already moved, and on the switches meant to stop it
 * moving in the first place.
 */

const SHOP = "guard-shop";
const PRODUCT = "guard-prod";
let productId = "";

async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Guardie", specialty: "Test", storeEnabled: true })
    .onConflictDoNothing({ target: shops.slug });
  await db
    .insert(products)
    .values({
      slug: PRODUCT,
      name: "Prodotto guardia",
      shopSlug: SHOP,
      priceCents: 1000,
      purchasable: true,
      active: true,
      stock: 50,
    })
    .onConflictDoNothing({ target: products.slug });
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.slug, PRODUCT));
  productId = p.id;
});

afterEach(async () => {
  await setSetting("store.enabled", true);
  await setSetting("porchetta.cutoffDay", "friday");
});

/**
 * "Se disattivo, il negozio è di sola consultazione" is what Impostazioni
 * promises. It was true only of the catalogue pages, which hide the grid —
 * `createOrder` never read the setting, so a cart already in localStorage
 * checked out perfectly happily against a shop the owner believed was closed.
 */
describe("store.enabled", () => {
  const basket = {
    name: "Cliente",
    email: "cliente@example.com",
    phone: "0711234567",
    fulfilment: "pickup" as const,
    paymentMethod: "in_store" as const,
    shopSlug: SHOP,
    items: [{ slug: PRODUCT, quantity: 1 }],
  };

  it("takes an order while the shop is open", async () => {
    await setSetting("store.enabled", true);
    const created = await createOrder(basket);
    expect(created.orderNumber).toBeTruthy();
  });

  it("refuses the order when the shop is switched off", async () => {
    await setSetting("store.enabled", false);
    await expect(createOrder(basket)).rejects.toThrow(/non accetta ordini/i);
  });

  it("writes no order and moves no stock when it refuses", async () => {
    await setSetting("store.enabled", false);
    const before = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, productId));
    const movesBefore = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));

    await expect(createOrder(basket)).rejects.toThrow();

    const after = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, productId));
    const movesAfter = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));
    expect(after[0].stock).toBe(before[0].stock);
    expect(movesAfter.length).toBe(movesBefore.length);
  });
});

/**
 * `porchetta.cutoffDay` was editable, seeded, and read by no code at all — the
 * rule it describes lived only as hard-coded prose on the public page.
 */
describe("porchettaCutoffFor", () => {
  // 2026-09-05 is a Saturday.
  const SATURDAY = "2026-09-05";

  it("resolves backwards from the pickup day", async () => {
    await setSetting("porchetta.cutoffDay", "friday");
    expect(await porchettaCutoffFor(SATURDAY)).toEqual({ iso: "2026-09-04", label: "venerdì" });
  });

  it("follows the setting rather than assuming Friday", async () => {
    await setSetting("porchetta.cutoffDay", "wednesday");
    expect(await porchettaCutoffFor(SATURDAY)).toEqual({ iso: "2026-09-02", label: "mercoledì" });
  });

  it("treats a cut-off on the pickup day as 'up to the day', not a week early", async () => {
    await setSetting("porchetta.cutoffDay", "saturday");
    expect(await porchettaCutoffFor(SATURDAY)).toEqual({ iso: SATURDAY, label: "sabato" });
  });

  it("judges a later week against that week's deadline", async () => {
    await setSetting("porchetta.cutoffDay", "friday");
    // The Saturday after — its deadline is its own Friday, not the first one.
    expect((await porchettaCutoffFor("2026-09-12")).iso).toBe("2026-09-11");
  });

  it("falls back to the pickup day on an unrecognised setting", async () => {
    await setSetting("porchetta.cutoffDay", "martedì grasso");
    // Forbids nothing that was allowed before, rather than inventing a deadline.
    expect((await porchettaCutoffFor(SATURDAY)).iso).toBe(SATURDAY);
  });
});
