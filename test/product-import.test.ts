import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products } from "@/lib/db/schema";
import { planProductImport, applyProductImport } from "@/lib/admin/product-import";

/**
 * Catalogue CSV import.
 *
 * The behaviours that matter are the conservative ones: a blank cell means
 * "leave it alone" (so a two-column price sheet is safe), an unknown slug is
 * reported rather than silently creating a product, and a file with any error
 * applies nothing at all.
 */

const SHOP = "import-shop";

const read = async (slug: string) =>
  (await db.select().from(products).where(eq(products.slug, slug)).limit(1))[0];

beforeAll(async () => {
  await db.insert(shops).values({ slug: SHOP, name: "Sede import", specialty: "test" }).onConflictDoNothing();
  await db
    .insert(products)
    .values([
      { slug: "imp-salame", name: "Salame", shopSlug: SHOP, priceCents: 850, stock: 10, vatRateBps: 1000 },
      { slug: "imp-pecorino", name: "Pecorino", shopSlug: SHOP, priceCents: 1200, stock: 4, vatRateBps: 1000 },
    ])
    .onConflictDoNothing();
});

describe("planProductImport", () => {
  it("refuses a file with no slug column", async () => {
    const plan = await planProductImport("nome,prezzoEuros\nSalame,9.00");
    expect(plan.issues[0].message).toContain("slug");
    expect(plan.updates).toHaveLength(0);
  });

  it("treats a two-column sheet as a price update and touches nothing else", async () => {
    const plan = await planProductImport("slug,prezzoEuros\nimp-salame,9.50");
    expect(plan.issues).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
    // Only the price is in the change set — name, stock and the rest are absent.
    expect(plan.updates[0].changes).toEqual({ priceCents: 950 });
  });

  it("leaves a blank cell alone rather than clearing the value", async () => {
    const plan = await planProductImport("slug,prezzoEuros,fornitore\nimp-salame,9.50,");
    expect(plan.updates[0].changes).toEqual({ priceCents: 950 });
    expect("supplier" in plan.updates[0].changes).toBe(false);
  });

  it("reports an unknown slug instead of inventing a product", async () => {
    const plan = await planProductImport("slug,prezzoEuros\nnon-esiste,4.00");
    expect(plan.updates).toHaveLength(0);
    expect(plan.creates).toHaveLength(0);
    expect(plan.issues[0].message).toContain("non-esiste");
  });

  it("creates unknown products when asked, with a shop", async () => {
    const plan = await planProductImport("slug,nome,prezzoEuros\nimp-nuovo,Nuovo,3.00", {
      create: true,
      defaultShopSlug: SHOP,
    });
    expect(plan.issues).toHaveLength(0);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].values).toMatchObject({ slug: "imp-nuovo", name: "Nuovo", priceCents: 300 });
  });

  it("rejects a new product with no name", async () => {
    const plan = await planProductImport("slug,prezzoEuros\nimp-senza-nome,3.00", {
      create: true,
      defaultShopSlug: SHOP,
    });
    expect(plan.creates).toHaveLength(0);
    expect(plan.issues[0].message).toContain("nome");
  });

  it("flags a malformed number and a duplicate slug", async () => {
    const plan = await planProductImport(
      "slug,prezzoEuros\nimp-salame,tanti\nimp-pecorino,5.00\nimp-pecorino,6.00",
    );
    const messages = plan.issues.map((i) => i.message).join(" ");
    expect(messages).toContain("Importo non valido");
    expect(messages).toContain("più di una volta");
  });

  it("parses booleans and quoted fields", async () => {
    const plan = await planProductImport(
      'slug,nome,acquistabile\nimp-salame,"Salame, grande",si',
    );
    expect(plan.issues).toHaveLength(0);
    expect(plan.updates[0].changes).toEqual({ name: "Salame, grande", purchasable: true });
  });

  it("rejects a non-boolean in a yes/no column", async () => {
    const plan = await planProductImport("slug,attivo\nimp-salame,forse");
    expect(plan.issues[0].message).toContain("si/no");
  });
});

describe("applyProductImport", () => {
  it("writes only what the plan contains", async () => {
    const before = await read("imp-pecorino");
    const plan = await planProductImport("slug,prezzoEuros\nimp-pecorino,13.50");
    const { updated, created } = await applyProductImport(plan);

    expect({ updated, created }).toEqual({ updated: 1, created: 0 });
    const after = await read("imp-pecorino");
    expect(after.priceCents).toBe(1350);
    // Everything the sheet didn't mention is untouched.
    expect(after.name).toBe(before.name);
    expect(after.stock).toBe(before.stock);
    expect(after.vatRateBps).toBe(before.vatRateBps);
  });
});

/**
 * Allergens were the one field on a food product a spreadsheet could not reach:
 * they had no column in either half of the round trip, so a bulk catalogue edit
 * silently could not touch them. Now that they are a controlled vocabulary
 * rather than free text, the import can resolve them exactly as the form does.
 */
describe("allergens through the round trip", () => {
  it("resolves a written list to the canonical keys", async () => {
    const plan = await planProductImport(`slug,allergeni\nimp-salame,"Lattosio, GLUTINE"`);

    expect(plan.issues).toHaveLength(0);
    expect(plan.updates[0]!.changes.allergens).toEqual(["glutine", "latte"]);
  });

  it("keeps something outside the fourteen rather than dropping it", async () => {
    const plan = await planProductImport(`slug,allergeni\nimp-salame,"latte, farina di castagne"`);
    expect(plan.updates[0]!.changes.allergens).toEqual(["latte", "farina-di-castagne"]);
  });

  it("leaves the column alone when the cell is blank", async () => {
    // A blank cell means "leave as is", not "clear" — the rule that makes a
    // two-column price sheet safe applies here too.
    const plan = await planProductImport(`slug,allergeni,prezzoEuros\nimp-salame,,9.50`);
    expect(plan.updates[0]!.changes).not.toHaveProperty("allergens");
    expect(plan.updates[0]!.changes.priceCents).toBe(950);
  });

  it("writes them through to the product", async () => {
    const plan = await planProductImport(`slug,allergeni\nimp-salame,"uova, sedano"`);
    await applyProductImport(plan);
    expect((await read("imp-salame"))!.allergens).toEqual(["uova", "sedano"]);
  });
});
