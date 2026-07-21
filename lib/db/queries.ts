import "server-only";
import { cache } from "react";
import { and, asc, desc, eq } from "drizzle-orm";
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
