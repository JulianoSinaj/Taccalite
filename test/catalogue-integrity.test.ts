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
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, products, shops, stockMovements, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginUser } from "@/lib/auth/service";
import { saveProduct } from "@/lib/admin/actions";
import { planProductImport, applyProductImport } from "@/lib/admin/product-import";
import { setProductStock } from "@/lib/stock";
import { getProducts, getPurchasableProducts } from "@/lib/db/queries";
import { parseAllergens, normaliseAllergen, allergenLabel, extraAllergens } from "@/lib/allergens";

/**
 * The catalogue's structural promises, as opposed to its parsing.
 *
 * `product-import.test.ts` already covers what the CSV reader makes of a file.
 * This covers what the catalogue is not allowed to let happen regardless of
 * which door the change came through: a quantity that moves without a movement,
 * a sede boundary that only the form honours, an archived product back on the
 * shelf, a VAT rate that ignores what its category declared, and an allergen
 * that is a different allergen depending on who typed it.
 */

const SHOP_A = "cat-shop-a";
const SHOP_B = "cat-shop-b";
const CAT_22 = "cat-cat-vino";
const idle = { status: "idle" as const };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const product = (slug: string) =>
  db.select().from(products).where(eq(products.slug, slug)).limit(1).then((r) => r[0]);

const movementsFor = (productId: string) =>
  db.select().from(stockMovements).where(eq(stockMovements.productId, productId));

/** On-hand must always equal the sum of everything the ledger recorded. */
async function ledgerSum(productId: string) {
  const rows = await movementsFor(productId);
  return rows.reduce((n, m) => n + m.delta, 0);
}

async function loginAs(username: string) {
  const res = await loginUser({ identifier: username, password: "Password!234" });
  expect(res.ok).toBe(true);
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values([
      { slug: SHOP_A, name: "Sede A", specialty: "test" },
      { slug: SHOP_B, name: "Sede B", specialty: "test" },
    ])
    .onConflictDoNothing({ target: shops.slug });

  await db
    .insert(categories)
    .values({ id: CAT_22, slug: "cat-vino", name: "Cantina di prova", kind: "product", defaultVatRateBps: 2200 })
    .onConflictDoNothing();

  await db
    .insert(users)
    .values([
      {
        username: "cat-admin",
        email: "cat-admin@example.com",
        name: "Admin",
        passwordHash: hashPassword("Password!234"),
        role: "admin",
      },
      {
        // Staff, confined to Sede A. `requireAdmin` admits staff, which is why
        // the scope check has to be its own question.
        username: "cat-staff-a",
        email: "cat-staff-a@example.com",
        name: "Banco A",
        passwordHash: hashPassword("Password!234"),
        role: "staff",
        shopSlug: SHOP_A,
      },
    ])
    .onConflictDoNothing({ target: users.username });
});

beforeEach(async () => {
  const slugs = [
    "cat-p1", "cat-p2", "cat-archived", "cat-new", "cat-intruso",
    "cat-aaa", "cat-zzz", "cat-vino-nuovo", "cat-imported", "cat-dup",
  ];
  const rows = await db.select({ id: products.id }).from(products).where(inArray(products.slug, slugs));
  if (rows.length > 0) {
    await db.delete(stockMovements).where(inArray(stockMovements.productId, rows.map((r) => r.id)));
  }
  await db.delete(products).where(inArray(products.slug, slugs));
  await loginAs("cat-admin");
});

// ── the ledger ───────────────────────────────────────────────────────────────

describe("setProductStock", () => {
  const seed = async (stock: number | null) => {
    const [row] = await db
      .insert(products)
      .values({ slug: "cat-p1", name: "Prodotto", shopSlug: SHOP_A, priceCents: 500, stock })
      .returning({ id: products.id });
    return row!.id;
  };

  it("ledgers a number → number change so the history still sums to on-hand", async () => {
    const id = await seed(10);
    await setProductStock({ productId: id, from: 10, to: 25, reason: "Test" });

    expect((await product("cat-p1"))?.stock).toBe(25);
    const moves = await movementsFor(id);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.delta).toBe(15);
    expect(moves[0]!.stockAfter).toBe(25);
  });

  it("opens the ledger at zero when a product starts tracking stock", async () => {
    // null is a mode, not a quantity: going from made-to-order to tracked has
    // to leave the opening figure as a real movement, not a number that
    // appeared with nothing behind it.
    const id = await seed(null);
    await setProductStock({ productId: id, from: null, to: 8, reason: "Test" });

    expect((await product("cat-p1"))?.stock).toBe(8);
    expect(await ledgerSum(id)).toBe(8);
  });

  it("closes the history at zero when a product stops tracking stock", async () => {
    const id = await seed(6);
    await setProductStock({ productId: id, from: 6, to: null, reason: "Test" });

    expect((await product("cat-p1"))?.stock).toBeNull();
    // The balance was walked down to zero before the mode changed, so the
    // ledger says where the six units went instead of the figure just vanishing
    // when the product switched to made-to-order.
    const moves = await movementsFor(id);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.delta).toBe(-6);
    expect(moves[0]!.stockAfter).toBe(0);
  });

  it("writes nothing at all when the figure is unchanged", async () => {
    const id = await seed(10);
    await setProductStock({ productId: id, from: 10, to: 10, reason: "Test" });
    expect(await movementsFor(id)).toHaveLength(0);
  });
});

// ── the product form ─────────────────────────────────────────────────────────

describe("saveProduct", () => {
  const base = { name: "Salame di prova", shopSlug: SHOP_A, active: "on", sortOrder: "0" };

  it("refuses a staff member creating a product in another sede", async () => {
    // The regression this exists for: only the *update* branch used to ask
    // about scope, so the create path was reachable by posting another shop's
    // slug — the form offers one shop, but a form is not access control.
    await loginAs("cat-staff-a");
    const res = await saveProduct(idle, form({ ...base, slug: "cat-intruso", shopSlug: SHOP_B }));

    expect(res.status).toBe("error");
    expect(res.message).toMatch(/un'altra sede/);
    expect(await product("cat-intruso")).toBeUndefined();
  });

  it("lets the same staff member create in their own sede", async () => {
    await loginAs("cat-staff-a");
    const res = await saveProduct(idle, form({ ...base, slug: "cat-new" }));

    expect(res.status).toBe("success");
    expect((await product("cat-new"))?.shopSlug).toBe(SHOP_A);
  });

  it("ledgers the opening quantity of a new product", async () => {
    const res = await saveProduct(idle, form({ ...base, slug: "cat-new", stock: "12" }));
    expect(res.status).toBe("success");

    const row = await product("cat-new");
    expect(row?.stock).toBe(12);
    expect(await ledgerSum(row!.id)).toBe(12);
  });

  it("ledgers a stock change made from the product form", async () => {
    // The editor used to write `products.stock` with a plain UPDATE, so the
    // most obvious way to change a quantity was the one way that left no trace.
    await saveProduct(idle, form({ ...base, slug: "cat-new", stock: "12" }));
    const id = (await product("cat-new"))!.id;

    await saveProduct(idle, form({ ...base, id, slug: "cat-new", stock: "30" }));

    expect((await product("cat-new"))?.stock).toBe(30);
    expect(await ledgerSum(id)).toBe(30);
    expect(await movementsFor(id)).toHaveLength(2);
  });

  it("takes the VAT rate its category declares when the form doesn't say", async () => {
    const res = await saveProduct(
      idle,
      form({ ...base, slug: "cat-vino-nuovo", name: "Verdicchio", categoryId: CAT_22 }),
    );
    expect(res.status).toBe("success");
    // 22 %, not the 10 % column default: "declared, not inferred" now holds on
    // the server and not only in the picker's client-side handler.
    expect((await product("cat-vino-nuovo"))?.vatRateBps).toBe(2200);
  });

  it("still honours an explicit rate over the category's", async () => {
    await saveProduct(
      idle,
      form({ ...base, slug: "cat-vino-nuovo", name: "Verdicchio", categoryId: CAT_22, vatRate: "4" }),
    );
    expect((await product("cat-vino-nuovo"))?.vatRateBps).toBe(400);
  });

  it("names the offending slug when a hand-typed one is already taken", async () => {
    await saveProduct(idle, form({ ...base, slug: "cat-dup" }));
    const res = await saveProduct(idle, form({ ...base, slug: "cat-dup", name: "Un altro" }));

    // Previously this reached the UNIQUE index and came back as the generic
    // "errore imprevisto", with nothing pointing at the slug.
    expect(res.status).toBe("error");
    expect(res.message).toContain("cat-dup");
    expect(res.fieldErrors?.slug).toBeTruthy();
  });

  it("stores allergens as canonical keys whatever the spelling", async () => {
    await saveProduct(idle, form({ ...base, slug: "cat-new", allergens: "Lattosio, GLUTINE, noci" }));
    expect((await product("cat-new"))?.allergens).toEqual(["glutine", "latte", "frutta-a-guscio"]);
  });
});

// ── the importer ─────────────────────────────────────────────────────────────

describe("product import", () => {
  it("refuses to put an archived product back on sale", async () => {
    await db.insert(products).values({
      slug: "cat-archived",
      name: "Archiviato",
      shopSlug: SHOP_A,
      active: false,
      archivedAt: new Date(),
    });

    const plan = await planProductImport("slug,attivo\ncat-archived,si");

    // The quick toggles and the product form both refuse this; the importer was
    // the way round them, and every storefront query filters on `active` alone.
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]!.message).toMatch(/archiviato/);
    expect(plan.updates).toHaveLength(0);
  });

  it("still lets an archived product be edited in ways that don't revive it", async () => {
    await db.insert(products).values({
      slug: "cat-archived",
      name: "Archiviato",
      shopSlug: SHOP_A,
      active: false,
      archivedAt: new Date(),
    });

    const plan = await planProductImport("slug,prezzoEuros\ncat-archived,9.50");
    expect(plan.issues).toHaveLength(0);
    expect(plan.updates).toHaveLength(1);
  });

  it("ledgers a quantity brought in from a sheet", async () => {
    const [row] = await db
      .insert(products)
      .values({ slug: "cat-imported", name: "Importato", shopSlug: SHOP_A, stock: 4 })
      .returning({ id: products.id });

    const plan = await planProductImport("slug,giacenza\ncat-imported,19");
    expect(plan.issues).toHaveLength(0);
    await applyProductImport(plan);

    expect((await product("cat-imported"))?.stock).toBe(19);
    // The import used to move the number with a plain UPDATE — no movement, no
    // back-in-stock mail, and `lowStockNotifiedAt` left latched.
    expect(await ledgerSum(row!.id)).toBe(15);
  });

  it("gives a newly created row the VAT rate its category declares", async () => {
    const plan = await planProductImport(
      "slug,nome,sede,categoria\ncat-vino-nuovo,Rosso Conero,cat-shop-a,Cantina di prova",
      { create: true },
    );
    expect(plan.issues).toHaveLength(0);
    await applyProductImport(plan);

    expect((await product("cat-vino-nuovo"))?.vatRateBps).toBe(2200);
  });

  it("ledgers the opening quantity of a row the sheet creates", async () => {
    const plan = await planProductImport(
      "slug,nome,sede,giacenza\ncat-imported,Nuovo,cat-shop-a,7",
      { create: true },
    );
    await applyProductImport(plan);

    const row = await product("cat-imported");
    expect(row?.stock).toBe(7);
    expect(await ledgerSum(row!.id)).toBe(7);
  });
});

// ── what the storefront may see ──────────────────────────────────────────────

describe("public catalogue queries", () => {
  it("hides an archived product even when something left it active", async () => {
    // Exactly the state the importer could produce: `active` back on with the
    // archive stamp still set. The public queries now ask about the stamp
    // themselves rather than trusting another action to have remembered.
    await db.insert(products).values({
      slug: "cat-archived",
      name: "Archiviato",
      shopSlug: SHOP_A,
      priceCents: 500,
      active: true,
      purchasable: true,
      archivedAt: new Date(),
    });

    expect((await getProducts()).some((p) => p.slug === "cat-archived")).toBe(false);
    expect((await getPurchasableProducts()).some((p) => p.slug === "cat-archived")).toBe(false);
  });

  it("orders an unsorted catalogue by name rather than at random", async () => {
    // Every product ships at sortOrder 0, so ordering by that alone left the
    // shelf in whatever order SQLite happened to return.
    await db.insert(products).values([
      { slug: "cat-zzz", name: "Zzz ultimo", shopSlug: SHOP_A, priceCents: 100, sortOrder: 0 },
      { slug: "cat-aaa", name: "Aaa primo", shopSlug: SHOP_A, priceCents: 100, sortOrder: 0 },
    ]);

    const rows = (await getProducts()).filter((p) => p.slug === "cat-aaa" || p.slug === "cat-zzz");
    expect(rows.map((p) => p.slug)).toEqual(["cat-aaa", "cat-zzz"]);
  });
});

// ── the vocabulary ───────────────────────────────────────────────────────────

describe("allergens", () => {
  it("resolves the spellings the shop actually writes", () => {
    expect(normaliseAllergen("Lattosio")).toBe("latte");
    expect(normaliseAllergen("  GLUTINE  ")).toBe("glutine");
    expect(normaliseAllergen("Frutta a guscio")).toBe("frutta-a-guscio");
    expect(normaliseAllergen("nocciole")).toBe("frutta-a-guscio");
    expect(normaliseAllergen("Anidride solforosa e solfiti")).toBe("solfiti");
  });

  it("keeps something outside the fourteen rather than dropping it", () => {
    // Losing an allergen from a food page to tidy up a data model would be the
    // worse failure by a distance.
    expect(parseAllergens("latte, farina di castagne")).toEqual(["latte", "farina-di-castagne"]);
    expect(extraAllergens(["latte", "farina-di-castagne"])).toEqual(["farina-di-castagne"]);
  });

  it("dedupes spellings of the same allergen and orders by Annex II", () => {
    expect(parseAllergens("Latte, lattosio, LATTE")).toEqual(["latte"]);
    // Annex II order, so two products with the same allergens store them
    // identically and an audit diff stays readable.
    expect(parseAllergens("sedano, uova, glutine")).toEqual(["glutine", "uova", "sedano"]);
  });

  it("renders a stored key as the label a shelf uses", () => {
    expect(allergenLabel("solfiti")).toBe("Anidride solforosa e solfiti");
    expect(allergenLabel("frutta-a-guscio")).toBe("Frutta a guscio");
    expect(allergenLabel("farina-di-castagne")).toBe("farina di castagne");
  });

  it("round-trips an unlisted allergen without collecting hyphens", () => {
    // The "altro" box on the product form shows what is stored. Rendering the
    // stored key straight back turned "farina di castagne" into
    // "farina-di-castagne", and every subsequent save fed the hyphens through
    // again — so the label and the parse have to be inverses.
    const stored = parseAllergens("farina di castagne");
    expect(stored).toEqual(["farina-di-castagne"]);
    const shown = stored.map(allergenLabel).join(", ");
    expect(shown).toBe("farina di castagne");
    expect(parseAllergens(shown)).toEqual(stored);
  });

  it("ignores blanks and stray separators", () => {
    expect(parseAllergens("")).toEqual([]);
    expect(parseAllergens(" , ,\n")).toEqual([]);
  });
});
