import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, discountCodes } from "@/lib/db/schema";
import { getProductsPage, getDiscountsPage } from "@/lib/admin/queries";
import { productFilters, discountFilters } from "@/lib/admin/filters";
import { filterHref } from "@/components/admin/FilterBar";

const SHOP = "filt-shop";
const OTHER = "filt-other";
const THRESHOLD = 5;

/** Only the rows this suite created, so other suites' fixtures don't leak in. */
const mine = <T extends { shopSlug: string }>(rows: T[]): T[] =>
  rows.filter((r) => r.shopSlug === SHOP || r.shopSlug === OTHER);

beforeAll(async () => {
  for (const slug of [SHOP, OTHER]) {
    await db
      .insert(shops)
      .values({ slug, name: slug, specialty: "Test" })
      .onConflictDoNothing({ target: shops.slug });
  }
});

beforeEach(async () => {
  await db.delete(products).where(eq(products.shopSlug, SHOP));
  await db.delete(products).where(eq(products.shopSlug, OTHER));
  await db.insert(products).values([
    // name, shop, category, active, purchasable, stock
    { slug: "f-salame", name: "Salame", shopSlug: SHOP, category: "salumi", active: true, purchasable: true, stock: 20, priceCents: 900 },
    { slug: "f-lardo", name: "Lardo", shopSlug: SHOP, category: "salumi", active: true, purchasable: true, stock: 3, priceCents: 700 },
    { slug: "f-finita", name: "Finita", shopSlug: SHOP, category: "salumi", active: false, purchasable: false, stock: 0, priceCents: 500 },
    { slug: "f-ordine", name: "Su ordinazione", shopSlug: OTHER, category: "fresco", active: true, purchasable: false, stock: null, priceCents: 1200 },
  ]);
});

describe("productFilters + getProductsPage", () => {
  it("defaults every facet to 'all'", () => {
    expect(productFilters({})).toEqual({
      negozio: "all",
      categoria: "all",
      stato: "all",
      scorte: "all",
      q: undefined,
    });
  });

  it("filters by shop", async () => {
    const { rows } = await getProductsPage({
      ...productFilters({ negozio: OTHER }),
      lowStockThreshold: THRESHOLD,
    });
    expect(mine(rows).map((r) => r.slug)).toEqual(["f-ordine"]);
  });

  it("treats an untracked stock as unlimited, not low", async () => {
    const low = await getProductsPage({
      ...productFilters({ scorte: "basse" }),
      lowStockThreshold: THRESHOLD,
    });
    // Lardo (3) and Finita (0) are at/under 5; "Su ordinazione" has stock NULL.
    expect(mine(low.rows).map((r) => r.slug).sort()).toEqual(["f-finita", "f-lardo"]);

    const unlimited = await getProductsPage({
      ...productFilters({ scorte: "illimitate" }),
      lowStockThreshold: THRESHOLD,
    });
    expect(mine(unlimited.rows).map((r) => r.slug)).toEqual(["f-ordine"]);
  });

  it("filters by status and by online availability", async () => {
    const inactive = await getProductsPage({
      ...productFilters({ stato: "disattivati" }),
      lowStockThreshold: THRESHOLD,
    });
    expect(mine(inactive.rows).map((r) => r.slug)).toEqual(["f-finita"]);

    const online = await getProductsPage({
      ...productFilters({ stato: "shop" }),
      lowStockThreshold: THRESHOLD,
    });
    expect(mine(online.rows).map((r) => r.slug).sort()).toEqual(["f-lardo", "f-salame"]);
  });

  it("searches name, slug and category case-insensitively", async () => {
    const byName = await getProductsPage({
      ...productFilters({ q: "SALAM" }),
      lowStockThreshold: THRESHOLD,
    });
    expect(mine(byName.rows).map((r) => r.slug)).toEqual(["f-salame"]);

    const byCategory = await getProductsPage({
      ...productFilters({ q: "salumi" }),
      lowStockThreshold: THRESHOLD,
    });
    expect(mine(byCategory.rows)).toHaveLength(3);
  });

  it("combines facets", async () => {
    const { rows } = await getProductsPage({
      ...productFilters({ negozio: SHOP, stato: "attivi", scorte: "basse" }),
      lowStockThreshold: THRESHOLD,
    });
    expect(mine(rows).map((r) => r.slug)).toEqual(["f-lardo"]);
  });
});

describe("discountFilters + getDiscountsPage", () => {
  beforeEach(async () => {
    for (const code of ["FLT-A", "FLT-B"]) {
      await db.delete(discountCodes).where(eq(discountCodes.code, code));
    }
    await db.insert(discountCodes).values([
      { code: "FLT-A", type: "percent", value: 10, active: true, maxRedemptions: 2, timesUsed: 2 },
      { code: "FLT-B", type: "fixed", value: 500, active: true, maxRedemptions: 5, timesUsed: 1 },
    ]);
  });

  it("finds codes that have reached their redemption cap", async () => {
    const { rows } = await getDiscountsPage(discountFilters({ stato: "esauriti", q: "flt-" }));
    expect(rows.map((r) => r.code)).toEqual(["FLT-A"]);
  });

  it("filters by type", async () => {
    const { rows } = await getDiscountsPage(discountFilters({ tipo: "fixed", q: "flt-" }));
    expect(rows.map((r) => r.code)).toEqual(["FLT-B"]);
  });
});

describe("filterHref", () => {
  it("preserves sibling facets and drops paging", () => {
    const href = filterHref("/admin/products", { negozio: "centro", q: "sal", page: "3" }, { stato: "attivi" });
    expect(href).toBe("/admin/products?negozio=centro&q=sal&stato=attivi");
  });

  it("clears a facet set back to 'all'", () => {
    const href = filterHref("/admin/products", { negozio: "centro" }, { negozio: "all" });
    expect(href).toBe("/admin/products");
  });
});
