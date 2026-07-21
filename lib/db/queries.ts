import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";

/**
 * Read-side data access for content pages. Wrapped in React `cache()` for
 * per-request deduplication. Pages that use these should opt into dynamic
 * rendering so admin edits appear immediately (see each page's route config).
 */

export const getShops = cache(async () => {
  return db.select().from(schema.shops).orderBy(asc(schema.shops.sortOrder));
});

export const getShopBySlug = cache(async (slug: string) => {
  const rows = await db.select().from(schema.shops).where(eq(schema.shops.slug, slug)).limit(1);
  return rows[0] ?? null;
});

export const getProducts = cache(async () => {
  return db
    .select()
    .from(schema.products)
    .where(eq(schema.products.active, true))
    .orderBy(asc(schema.products.sortOrder));
});

export const getFeaturedProducts = cache(async () => {
  return db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.active, true), eq(schema.products.featured, true)))
    .orderBy(asc(schema.products.sortOrder));
});

export const getProductsByShop = cache(async (shopSlug: string) => {
  return db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.active, true), eq(schema.products.shopSlug, shopSlug)))
    .orderBy(asc(schema.products.sortOrder));
});

export const getPurchasableProducts = cache(async () => {
  return db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.active, true), eq(schema.products.purchasable, true)))
    .orderBy(asc(schema.products.sortOrder));
});

export const getProductBySlug = cache(async (slug: string) => {
  const rows = await db.select().from(schema.products).where(eq(schema.products.slug, slug)).limit(1);
  return rows[0] ?? null;
});

export const getBlogPosts = cache(async () => {
  return db
    .select()
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.published, true))
    .orderBy(desc(schema.blogPosts.date));
});

export const getBlogPostBySlug = cache(async (slug: string) => {
  const rows = await db
    .select()
    .from(schema.blogPosts)
    .where(eq(schema.blogPosts.slug, slug))
    .limit(1);
  return rows[0] ?? null;
});

export const getRewards = cache(async () => {
  return db
    .select()
    .from(schema.rewards)
    .where(eq(schema.rewards.active, true))
    .orderBy(asc(schema.rewards.sortOrder));
});

export const getSetting = cache(async <T = unknown>(key: string, fallback: T): Promise<T> => {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  return rows.length ? (rows[0].value as T) : fallback;
});

/**
 * Persist a single setting (upsert). Write-side, so intentionally NOT wrapped in
 * `cache()`. Bumps `updatedAt` on conflict, mirroring the admin settings action.
 */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
}

/**
 * Look up a reservation by its unguessable `reference` code (bearer token for the
 * public tracking page). Returns the single row or null.
 */
export const getReservationByReference = cache(async (reference: string) => {
  const rows = await db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.reference, reference))
    .limit(1);
  return rows[0] ?? null;
});

/** Distinct product categories among active products, for the store filter nav. */
export const getProductCategories = cache(async () => {
  const rows = await db
    .selectDistinct({ category: schema.products.category })
    .from(schema.products)
    .where(and(eq(schema.products.active, true), eq(schema.products.purchasable, true)))
    .orderBy(asc(schema.products.category));
  return rows.map((r) => r.category).filter((c): c is string => !!c);
});

/** Up to `limit` other purchasable products, preferring the same category then shop. */
export const getRelatedProducts = cache(
  async (product: { slug: string; category: string; shopSlug: string }, limit = 4) => {
    const pool = await db
      .select()
      .from(schema.products)
      .where(and(eq(schema.products.active, true), eq(schema.products.purchasable, true)))
      .orderBy(asc(schema.products.sortOrder));
    const others = pool.filter((p) => p.slug !== product.slug);
    const sameCat = others.filter((p) => p.category && p.category === product.category);
    const sameShop = others.filter((p) => p.shopSlug === product.shopSlug && !sameCat.includes(p));
    const rest = others.filter((p) => !sameCat.includes(p) && !sameShop.includes(p));
    return [...sameCat, ...sameShop, ...rest].slice(0, limit);
  },
);

/** A logged-in customer's reservations (newest first) for their account history. */
export const getReservationsForUser = cache(async (userId: string) => {
  return db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.userId, userId))
    .orderBy(desc(schema.reservations.createdAt))
    .limit(50);
});

/** A logged-in customer's reward redemptions (newest first). */
export const getRedemptionsForUser = cache(async (userId: string) => {
  return db
    .select()
    .from(schema.redemptions)
    .where(eq(schema.redemptions.userId, userId))
    .orderBy(desc(schema.redemptions.createdAt))
    .limit(50);
});

/**
 * Guest order tracking: look up an order by its number AND the email used to
 * place it (the email acts as the bearer proof, since order numbers are
 * guessable). Returns order + items, or null.
 */
export const getOrderByNumberAndEmail = cache(async (orderNumber: string, email: string) => {
  const [order] = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.orderNumber, orderNumber.trim()),
        eq(sql`lower(${schema.orders.email})`, email.trim().toLowerCase()),
      ),
    )
    .limit(1);
  if (!order) return null;
  const items = await db
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, order.id));
  return { order, items };
});
