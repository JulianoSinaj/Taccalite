import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, lte, ne, or, sql } from "drizzle-orm";
import { db } from "./client";
import * as schema from "./schema";
import { dateInRome } from "@/lib/time";

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
  // Scheduled publishing: a published post with a future date stays hidden until
  // its date arrives. `date` is stored as ISO yyyy-mm-dd, so a lexicographic
  // comparison against today is correct.
  //
  // Today on the Rome clock, not the server's: `date` holds Italian local dates,
  // and the back office already classifies "programmato" with `dateInRome` (see
  // `lib/admin/filters.ts`). Read in UTC, a post dated today stayed hidden for
  // the first hour or two of the Italian day while the admin list called it
  // published.
  const today = dateInRome();
  return db
    .select()
    .from(schema.blogPosts)
    .where(and(eq(schema.blogPosts.published, true), lte(schema.blogPosts.date, today)))
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
  // Category *rows*, not distinct strings. The rail used to be `select distinct
  // products.category`, which meant it had no order the shop could choose, no
  // way to hide a category, no colour except a keyword guess, and no URL — and a
  // single mistyped name grew an extra chip holding one product.
  //
  // Still driven by what is actually on sale: an empty category is a real
  // grouping in the gestionale but nothing to offer a customer.
  const rows = await db
    .selectDistinct({
      id: schema.categories.id,
      slug: schema.categories.slug,
      name: schema.categories.name,
      accent: schema.categories.accent,
      sortOrder: schema.categories.sortOrder,
    })
    .from(schema.categories)
    .innerJoin(schema.products, eq(schema.products.categoryId, schema.categories.id))
    .where(
      and(
        eq(schema.categories.kind, "product"),
        eq(schema.categories.active, true),
        eq(schema.products.active, true),
        eq(schema.products.purchasable, true),
      ),
    )
    .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  return rows;
});

export type StoreCategory = Awaited<ReturnType<typeof getProductCategories>>[number];

/** One product category by id — used to link a product to its category page. */
export const getProductCategoryById = cache(async (id: string) => {
  const [row] = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, id))
    .limit(1);
  return row ?? null;
});

/** One visible product category by slug, for `/negozio/categoria/[slug]`. */
export const getProductCategoryBySlug = cache(async (slug: string) => {
  const [row] = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.kind, "product"),
        eq(schema.categories.active, true),
        eq(schema.categories.slug, slug),
      ),
    )
    .limit(1);
  return row ?? null;
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

/* `getPorchettaKgForDate` lived here: a shop-blind sum of the day's pre-orders,
 * compared by the public page against a single shared cap. With two locations it
 * measured a two-shop total against a one-shop number, so the advertised
 * availability and the capacity actually enforced at submit could disagree.
 * Availability now comes from `porchettaAvailability()` in `lib/reservations.ts`,
 * which reuses the same per-shop check the booking path enforces. Deliberately
 * not kept as a convenience: an unscoped helper is how the two drifted apart. */

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

// ── Fulfilment: zones and pickup windows ─────────────────────────────────────

/**
 * Active delivery/shipping zones, most specific first is *not* meaningful here —
 * `matchZone` scores by CAP, so ordering is purely editorial (it is what the
 * checkout and the admin list show).
 */
export const getDeliveryZones = cache(async () => {
  return db
    .select()
    .from(schema.deliveryZones)
    .where(eq(schema.deliveryZones.active, true))
    .orderBy(asc(schema.deliveryZones.sortOrder), asc(schema.deliveryZones.name));
});

/** Active pickup windows, optionally for one location. */
export const getPickupSlots = cache(async (shopSlug?: string) => {
  const where = shopSlug
    ? and(eq(schema.pickupSlots.active, true), eq(schema.pickupSlots.shopSlug, shopSlug))
    : eq(schema.pickupSlots.active, true);
  return db
    .select()
    .from(schema.pickupSlots)
    .where(where)
    .orderBy(asc(schema.pickupSlots.weekday), asc(schema.pickupSlots.startTime));
});

/**
 * Closures that could still matter — anything not already wholly in the past.
 *
 * Filtered on `toDate` rather than loaded whole because the table only ever
 * grows: last year's Ferragosto can never gate a future date, and both readers
 * (the booking gate and the window generator) look forward only.
 */
export const getClosures = cache(async (fromDate?: string) => {
  const from = fromDate ?? dateInRome();
  return db
    .select()
    .from(schema.shopClosures)
    .where(gte(schema.shopClosures.toDate, from))
    .orderBy(asc(schema.shopClosures.fromDate));
});

/**
 * How many live orders already hold each pickup window from `fromMs` onward,
 * keyed as `slotKey(shopSlug, atMs)`.
 *
 * Cancelled and refunded orders release their place — a window held by an order
 * nobody is coming to collect is a place the shop cannot sell twice.
 *
 * `fromMs` defaults here rather than at each call site because the callers are
 * server components, and the React Compiler lint forbids `Date.now()` in a
 * render body.
 */
export async function getPickupSlotCounts(fromMs = Date.now()): Promise<Map<string, number>> {
  // A card checkout holds its window only while the customer can still be
  // paying for it. The Stripe session lasts 30 minutes; an hour on, an unpaid
  // card order is an abandoned one, and it must not keep a place that the
  // sweep (`orders.abandonedAfterHours`, default 24 h) will only release later
  // — the last place in a Saturday window was going to nobody.
  const staleCardSince = new Date(Date.now() - 60 * 60_000);
  const rows = await db
    .select({
      shopSlug: schema.orders.shopSlug,
      at: schema.orders.pickupSlotAt,
      n: sql<number>`count(*)`,
    })
    .from(schema.orders)
    .where(
      and(
        gte(schema.orders.pickupSlotAt, new Date(fromMs)),
        sql`${schema.orders.status} not in ('cancelled', 'refunded')`,
        or(
          ne(schema.orders.paymentMethod, "card"),
          eq(schema.orders.paymentStatus, "paid"),
          gte(schema.orders.createdAt, staleCardSince),
        ),
      ),
    )
    .groupBy(schema.orders.shopSlug, schema.orders.pickupSlotAt);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (!r.shopSlug || !r.at) continue;
    map.set(`${r.shopSlug}|${r.at.getTime()}`, Number(r.n));
  }
  return map;
}
