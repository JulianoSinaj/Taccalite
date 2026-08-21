import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, products, blogPosts, shops } from "@/lib/db/schema";
import { categoryAccent } from "@/lib/categories";

const SHOP = "cat-test-shop";

/** Ids are stable so each test can clean up only its own rows. */
const A = "cat-test-a";
const B = "cat-test-b";
const CHILD = "cat-test-child";
const POST_CAT = "cat-test-post";

beforeAll(async () => {
  await db
    .insert(shops)
    .values({ slug: SHOP, name: "Categorie", specialty: "test" })
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  await db.delete(products).where(eq(products.shopSlug, SHOP));
  await db.delete(blogPosts).where(inArray(blogPosts.categoryId, [POST_CAT]));
  // Children first: the self-FK is `set null`, but deleting in order keeps the
  // fixtures independent of that behaviour.
  await db.delete(categories).where(inArray(categories.id, [CHILD, A, B, POST_CAT]));
  await db.insert(categories).values([
    { id: A, slug: "cat-a", name: "Cat A", kind: "product", sortOrder: 1, defaultVatRateBps: 400 },
    { id: B, slug: "cat-b", name: "Cat B", kind: "product", sortOrder: 2 },
    { id: CHILD, slug: "cat-child", name: "Cat Child", kind: "product", parentId: A, sortOrder: 3 },
    { id: POST_CAT, slug: "cat-a", name: "Cat A", kind: "post", sortOrder: 1 },
  ]);
});

async function addProduct(slug: string, categoryId: string, categoryName: string) {
  await db.insert(products).values({
    slug,
    name: slug,
    shopSlug: SHOP,
    category: categoryName,
    categoryId,
  });
}

describe("categories schema", () => {
  it("allows the same slug in both vocabularies", async () => {
    // "Formaggi" is a product category *and* a news category in the real data.
    // Uniqueness is per kind; a global unique index would have made the backfill
    // itself impossible.
    const rows = await db.select().from(categories).where(eq(categories.slug, "cat-a"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(["product", "post"]));
  });

  it("refuses a duplicate slug within one vocabulary", async () => {
    await expect(
      db.insert(categories).values({ slug: "cat-a", name: "Doppione", kind: "product" }),
    ).rejects.toThrow();
  });

  it("refuses a VAT rate outside 0–100%", async () => {
    await expect(
      db.insert(categories).values({ slug: "cat-bad", name: "Bad", kind: "product", defaultVatRateBps: 10001 }),
    ).rejects.toThrow();
  });

  it("refuses a kind outside the enum", async () => {
    await expect(
      db.insert(categories).values({
        slug: "cat-bad-kind",
        name: "Bad",
        // Drizzle enums are TypeScript-only — the CHECK constraint is what
        // actually holds the line, so it has to be exercised past the types.
        kind: "recipe" as "product",
      }),
    ).rejects.toThrow();
  });

  it("refuses to delete a category that still holds products", async () => {
    // RESTRICT, not SET NULL: orphaning the products would leave them carrying a
    // name that groups nothing — the exact state the taxonomy exists to end. The
    // admin action catches this and points at the merge tool.
    await addProduct("cat-p1", B, "Cat B");
    await expect(db.delete(categories).where(eq(categories.id, B))).rejects.toThrow();

    // Emptying it first is what makes the delete legal.
    await db.update(products).set({ categoryId: A, category: "Cat A" }).where(eq(products.slug, "cat-p1"));
    await db.delete(categories).where(eq(categories.id, B));
    const [p] = await db.select().from(products).where(eq(products.slug, "cat-p1"));
    expect(p.categoryId).toBe(A);
  });

  it("promotes a child when its parent is deleted", async () => {
    await db.delete(categories).where(eq(categories.id, A));
    const [child] = await db.select().from(categories).where(eq(categories.id, CHILD));
    expect(child).toBeDefined();
    expect(child.parentId).toBeNull();
  });
});

describe("categoryAccent", () => {
  it("honours a declared accent over the keyword guess", () => {
    // "Territorio" matches no keyword and used to fall through to the house
    // gold; declaring one is the escape hatch that stops being a code change.
    expect(categoryAccent("Territorio")).toBe(categoryAccent("qualcosa-di-ignoto"));
    expect(categoryAccent("Territorio", "cantina")).toBe(categoryAccent("Cantina"));
  });

  it("ignores an accent that isn't part of the palette", () => {
    expect(categoryAccent("Salumi", "fucsia")).toBe(categoryAccent("Salumi"));
  });

  it("still keyword-matches when nothing is declared", () => {
    expect(categoryAccent("Formaggi freschi")).toBe(categoryAccent("Formaggi"));
    expect(categoryAccent("Specialità della casa", null)).toBe(categoryAccent(""));
  });
});
