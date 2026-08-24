import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, products, discountCodes, orders } from "@/lib/db/schema";
import { getProductsPage, getDiscountsPage, getOrdersPage } from "@/lib/admin/queries";
import { productFilters, discountFilters, orderFilters } from "@/lib/admin/filters";
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

/**
 * The IVA report's drill-down and the orders list have to agree.
 *
 * The report counts orders whose money settled in the period —
 * `payment_status IN ('paid','refunded')`, dated by `coalesce(paid_at,
 * created_at)`. Its "Vedi gli ordini →" link used to go to
 * `?stato=paid&da=…&a=…`, which is `status = 'paid'` (so anything since marked
 * Evaso vanished) over `created_at` (a different window). Two mismatches in one
 * href, on the one page where the numbers are supposed to reconcile.
 */
describe("orderFilters — fiscal drill-down", () => {
  const SETTLED = "ord-settled";

  beforeAll(async () => {
    await db
      .insert(shops)
      .values({ slug: SETTLED, name: SETTLED, specialty: "Test" })
      .onConflictDoNothing({ target: shops.slug });
    await db.delete(orders).where(eq(orders.shopSlug, SETTLED));
    await db.insert(orders).values([
      {
        // Placed on 31 July, paid on 1 August: the case the whole
        // settled-vs-created distinction exists for.
        orderNumber: "T-STRADDLE",
        email: "a@example.com",
        name: "Straddle",
        shopSlug: SETTLED,
        status: "fulfilled",
        paymentStatus: "paid",
        totalCents: 1000,
        createdAt: new Date("2026-07-31T20:00:00Z"),
        paidAt: new Date("2026-08-01T09:00:00Z"),
      },
      {
        // Settled in August and since marked Evaso — in the report, and dropped
        // by the old `stato=paid` link.
        orderNumber: "T-FULFILLED",
        email: "b@example.com",
        name: "Evaso",
        shopSlug: SETTLED,
        status: "fulfilled",
        paymentStatus: "paid",
        totalCents: 2000,
        createdAt: new Date("2026-08-10T09:00:00Z"),
        paidAt: new Date("2026-08-10T09:00:00Z"),
      },
      {
        // Never paid: in neither.
        orderNumber: "T-UNPAID",
        email: "c@example.com",
        name: "Mai pagato",
        shopSlug: SETTLED,
        status: "pending",
        paymentStatus: "unpaid",
        totalCents: 3000,
        createdAt: new Date("2026-08-11T09:00:00Z"),
      },
    ]);
  });

  const august = (extra: Record<string, string>) =>
    getOrdersPage({
      ...orderFilters({ negozio: SETTLED, da: "2026-08-01", a: "2026-08-31", ...extra }),
      page: 1,
    });

  it("counts money taken in the period, whatever the order did next", async () => {
    const { rows } = await august({ stato: "incassati", data: "incasso" });
    expect(rows.map((r) => r.orderNumber).sort()).toEqual(["T-FULFILLED", "T-STRADDLE"]);
  });

  it("drops the straddling order when dated by when it was placed", async () => {
    const { rows } = await august({ stato: "incassati" });
    // Placed 31 July, so it is not an August order — but it IS August's VAT.
    expect(rows.map((r) => r.orderNumber)).toEqual(["T-FULFILLED"]);
  });

  it("is not the same set as the old stato=paid link", async () => {
    const { rows } = await august({ stato: "paid", data: "incasso" });
    // Both settled orders are `status: 'fulfilled'`, so the old link showed none
    // of the two the report had just counted.
    expect(rows).toHaveLength(0);
  });

  it("never counts an unpaid order", async () => {
    const { rows } = await august({ stato: "incassati", data: "incasso" });
    expect(rows.some((r) => r.orderNumber === "T-UNPAID")).toBe(false);
  });
});
