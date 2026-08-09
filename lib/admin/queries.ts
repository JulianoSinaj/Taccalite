import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

export const PAGE_SIZE = 25;
import { db } from "@/lib/db/client";
import { getSetting } from "@/lib/db/queries";
import { orderVatBuckets, aggregateVatBuckets, type VatBucket } from "@/lib/fiscal";
import { dateInRome, startOfTodayRome } from "@/lib/time";
import {
  ordersWhere,
  reservationsWhere,
  customersWhere,
  subscribersWhere,
  outboxWhere,
  productsWhere,
  blogWhere,
  rewardsWhere,
  discountsWhere,
  auditWhere,
  orderByFor,
  type SortSpec,
  type OrderFilters,
  type ReservationFilters,
  type CustomerFilters,
  type SubscriberFilters,
  type OutboxFilters,
  type ProductFilters,
  type BlogFilters,
  type RewardFilters,
  type DiscountFilters,
  type AuditFilters,
} from "@/lib/admin/filters";
import {
  reservations,
  orders,
  orderItems,
  products,
  blogPosts,
  shops,
  rewards,
  users,
  loyaltyAccounts,
  loyaltyTransactions,
  redemptions,
  newsletterSubscribers,
  emailOutbox,
  settings,
  auditLog,
  discountCodes,
  stockMovements,
} from "@/lib/db/schema";

export async function getDashboardStats() {
  const [pendingRes] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reservations)
    .where(eq(reservations.status, "pending"));
  const [totalRes] = await db.select({ n: sql<number>`count(*)` }).from(reservations);
  const [paidOrders] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.status, "paid"));
  const [customers] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, "customer"));
  const [subs] = await db
    .select({ n: sql<number>`count(*)` })
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "confirmed"));
  const [pendingRedemptions] = await db
    .select({ n: sql<number>`count(*)` })
    .from(redemptions)
    .where(eq(redemptions.status, "pending"));

  // Actionable work-queue: paid orders not yet fulfilled.
  const [toFulfil] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.status, "paid"));
  // Porchetta waitlist awaiting a decision.
  const [waitlisted] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reservations)
    .where(and(eq(reservations.waitlisted, true), sql`${reservations.status} != 'cancelled'`));
  // Failed emails needing attention.
  const [failedEmails] = await db
    .select({ n: sql<number>`count(*)` })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, "failed"));

  // Revenue from paid orders over rolling windows (integer cents).
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rev = async (sinceMs: number) => {
    const [r] = await db
      .select({ sum: sql<number>`coalesce(sum(${orders.totalCents}), 0)` })
      .from(orders)
      .where(and(eq(orders.paymentStatus, "paid"), gte(orders.createdAt, new Date(sinceMs))));
    return r?.sum ?? 0;
  };
  const startOfToday = startOfTodayRome();
  const [revenueToday, revenue7d, revenue30d] = await Promise.all([
    rev(startOfToday.getTime()),
    rev(now - 7 * day),
    rev(now - 30 * day),
  ]);

  return {
    pendingReservations: pendingRes?.n ?? 0,
    totalReservations: totalRes?.n ?? 0,
    paidOrders: paidOrders?.n ?? 0,
    ordersToFulfil: toFulfil?.n ?? 0,
    waitlisted: waitlisted?.n ?? 0,
    failedEmails: failedEmails?.n ?? 0,
    customers: customers?.n ?? 0,
    subscribers: subs?.n ?? 0,
    pendingRedemptions: pendingRedemptions?.n ?? 0,
    revenueTodayCents: revenueToday,
    revenue7dCents: revenue7d,
    revenue30dCents: revenue30d,
  };
}

/**
 * Richer dashboard analytics: average order value, 30-day revenue with a
 * period-over-period delta, new-customer counts, the daily revenue trend, and the
 * top products by revenue. All money in integer cents; only PAID orders counted.
 */
export async function getDashboardInsights() {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const p30 = new Date(now - 30 * day);
  const p60 = new Date(now - 60 * day);

  const paid = eq(orders.paymentStatus, "paid");

  const sumRev = async (from: Date, to?: Date) => {
    const conds = [paid, gte(orders.createdAt, from)];
    if (to) conds.push(lt(orders.createdAt, to));
    const [r] = await db
      .select({ sum: sql<number>`coalesce(sum(${orders.totalCents}), 0)`, n: sql<number>`count(*)` })
      .from(orders)
      .where(and(...conds));
    return { sum: r?.sum ?? 0, n: r?.n ?? 0 };
  };

  const countCustomers = async (from: Date, to?: Date) => {
    const conds = [eq(users.role, "customer"), gte(users.createdAt, from)];
    if (to) conds.push(lt(users.createdAt, to));
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(users).where(and(...conds));
    return r?.n ?? 0;
  };

  const dayExpr = sql<string>`date(${orders.createdAt} / 1000, 'unixepoch')`;

  const [last30, prev30, newCust30, newCustPrev, daily, topProducts] = await Promise.all([
    sumRev(p30),
    sumRev(p60, p30),
    countCustomers(p30),
    countCustomers(p60, p30),
    db
      .select({ day: dayExpr, cents: sql<number>`coalesce(sum(${orders.totalCents}), 0)` })
      .from(orders)
      .where(and(paid, gte(orders.createdAt, p30)))
      .groupBy(dayExpr)
      .orderBy(dayExpr),
    // Group on the stable product id, not the line's name snapshot: renaming a
    // product used to split its sales history into two rows. Lines with no
    // productId (a since-deleted product) fall back to grouping by name so their
    // revenue still shows. `max(name)` picks a single display label per group.
    db
      .select({
        name: sql<string>`max(${orderItems.name})`,
        cents: sql<number>`coalesce(sum(${orderItems.lineTotalCents}), 0)`,
        qty: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(paid, gte(orders.createdAt, p30)))
      .groupBy(sql`coalesce(${orderItems.productId}, ${orderItems.name})`)
      .orderBy(desc(sql`sum(${orderItems.lineTotalCents})`))
      .limit(5),
  ]);

  const aovCents = last30.n > 0 ? Math.round(last30.sum / last30.n) : 0;

  // Fill the daily revenue into a continuous 30-day series (UTC, to match the SQL
  // date() grouping) so the chart has no gaps.
  const byDay = new Map(daily.map((d) => [d.day, d.cents]));
  const dailySeries = Array.from({ length: 30 }, (_, i) => {
    const key = new Date(now - (29 - i) * day).toISOString().slice(0, 10);
    return { day: key, cents: byDay.get(key) ?? 0 };
  });

  return {
    revenue30dCents: last30.sum,
    revenuePrev30dCents: prev30.sum,
    orders30d: last30.n,
    aovCents,
    newCustomers30d: newCust30,
    newCustomersPrev30d: newCustPrev,
    dailySeries, // [{ day: "yyyy-mm-dd", cents }] — 30 continuous days
    topProducts, // [{ name, cents, qty }]
  };
}

/** Today's reservations (not cancelled), for the dashboard work list. */
export async function getTodayReservations() {
  const today = dateInRome();
  return db
    .select()
    .from(reservations)
    .where(and(eq(reservations.date, today), sql`${reservations.status} != 'cancelled'`))
    .orderBy(reservations.time)
    .limit(20);
}

/** The most recent orders, for the dashboard activity list. */
export async function getRecentOrders(limit = 6) {
  return db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limit);
}

/** Paginated reservations list for the given filters (see `lib/admin/filters`). */
export async function getReservationsPage(opts: ReservationFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = reservationsWhere(opts);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(reservations)
      .where(where)
      .orderBy(desc(reservations.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(reservations).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Upcoming (today onward) active reservations, ordered by date+time, for the
 *  agenda / porchetta prep views. */
export async function getUpcomingReservations() {
  const today = dateInRome();
  return db
    .select()
    .from(reservations)
    .where(
      and(gte(reservations.date, today), inArray(reservations.status, ["pending", "confirmed"])),
    )
    .orderBy(reservations.date, reservations.time);
}

export const getOrdersList = (shopSlug?: string) => {
  const q = db.select().from(orders).orderBy(desc(orders.createdAt));
  return shopSlug && shopSlug !== "all" ? q.where(eq(orders.shopSlug, shopSlug)) : q;
};

/** Paginated orders list for the given filters (see `lib/admin/filters`). */
export async function getOrdersPage(opts: OrderFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = ordersWhere(opts);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(orders).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Paginated customers list with points, for the given filters. */
export async function getCustomersPage(opts: CustomerFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = customersWhere(opts);
  const base = db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      phone: users.phone,
      role: users.role,
      createdAt: users.createdAt,
      points: loyaltyAccounts.points,
      cardNumber: loyaltyAccounts.cardNumber,
    })
    .from(users)
    .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id));

  const [rows, [{ total }]] = await Promise.all([
    (where ? base.where(where) : base)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id))
      .where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Every product, unpaginated — for pickers (manual order) and selects, not lists. */
export const adminGetProducts = () => db.select().from(products).orderBy(products.sortOrder);

/**
 * The VAT rate each category actually uses, so a new product in a known category
 * can preselect it instead of always defaulting to 10%. Where a category is
 * mixed, the most-used rate wins.
 */
export async function getCategoryVatDefaults(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      category: products.category,
      vatRateBps: products.vatRateBps,
      n: sql<number>`count(*)`,
    })
    .from(products)
    .groupBy(products.category, products.vatRateBps)
    .orderBy(desc(sql`count(*)`));

  const out: Record<string, number> = {};
  // Rows arrive most-frequent first, so the first hit per category wins.
  for (const r of rows) if (r.category && !(r.category in out)) out[r.category] = r.vatRateBps;
  return out;
}

/**
 * Paginated catalogue list. Also returns the distinct categories present in the
 * whole table (not just this page) so the category filter can offer them.
 */
export const PRODUCT_SORTS = ["nome", "prezzo", "giacenza", "categoria", "ordine"] as const;

export async function getProductsPage(
  opts: ProductFilters & { page?: number; lowStockThreshold: number; sort?: SortSpec },
) {
  const page = Math.max(1, opts.page ?? 1);
  const where = productsWhere(opts, opts.lowStockThreshold);
  const orderBy = opts.sort
    ? orderByFor(
        opts.sort,
        {
          nome: products.name,
          prezzo: products.priceCents,
          giacenza: products.stock,
          categoria: products.category,
          ordine: products.sortOrder,
        },
        products.sortOrder,
      )
    : asc(products.sortOrder);
  const [rows, [{ total }], categories] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(orderBy, products.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(products).where(where),
    db.selectDistinct({ category: products.category }).from(products).orderBy(products.category),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    categories: categories.map((c) => c.category).filter(Boolean),
  };
}

/** Paginated news list, with the distinct categories for the filter chips. */
export async function getBlogPage(opts: BlogFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = blogWhere(opts);
  const [rows, [{ total }], categories] = await Promise.all([
    db
      .select()
      .from(blogPosts)
      .where(where)
      .orderBy(desc(blogPosts.date))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(blogPosts).where(where),
    db.selectDistinct({ category: blogPosts.category }).from(blogPosts).orderBy(blogPosts.category),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    categories: categories.map((c) => c.category).filter(Boolean),
  };
}

/** Paginated rewards catalogue. */
export async function getRewardsPage(opts: RewardFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = rewardsWhere(opts);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(rewards)
      .where(where)
      .orderBy(rewards.sortOrder, rewards.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(rewards).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Paginated discount codes, newest first. */
export async function getDiscountsPage(opts: DiscountFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = discountsWhere(opts);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(discountCodes)
      .where(where)
      .orderBy(desc(discountCodes.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(discountCodes).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
export const adminGetProduct = (id: string) =>
  db.select().from(products).where(eq(products.id, id)).limit(1).then((r) => r[0] ?? null);

export const adminGetBlogPosts = () => db.select().from(blogPosts).orderBy(desc(blogPosts.date));
export const adminGetBlogPost = (id: string) =>
  db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1).then((r) => r[0] ?? null);

export const adminGetShops = () => db.select().from(shops).orderBy(shops.sortOrder);
export const adminGetShop = (id: string) =>
  db.select().from(shops).where(eq(shops.id, id)).limit(1).then((r) => r[0] ?? null);

export const adminGetRewards = () => db.select().from(rewards).orderBy(rewards.sortOrder);
export const adminGetReward = (id: string) =>
  db.select().from(rewards).where(eq(rewards.id, id)).limit(1).then((r) => r[0] ?? null);

export async function adminGetOrder(id: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
  return { order, items };
}

/** Paginated users list, selecting the same columns as the old adminGetUsers. */
export async function getUsersPage(opts: { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        name: users.name,
        role: users.role,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(users),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const adminGetUser = (id: string) =>
  db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);

/** Count of full admins — used to prevent demoting the last one. */
export const countAdmins = () =>
  db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.role, "admin"))
    .then((r) => r[0]?.n ?? 0);

/** A single user's loyalty account (points + card), or null. For the customer detail view. */
export const getLoyaltyAccountForUser = (userId: string) =>
  db
    .select({ points: loyaltyAccounts.points, cardNumber: loyaltyAccounts.cardNumber })
    .from(loyaltyAccounts)
    .where(eq(loyaltyAccounts.userId, userId))
    .limit(1)
    .then((r) => r[0] ?? null);

export async function getCustomersWithPoints(filters: CustomerFilters = {}) {
  const where = customersWhere(filters);
  const base = db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      phone: users.phone,
      role: users.role,
      createdAt: users.createdAt,
      points: loyaltyAccounts.points,
      cardNumber: loyaltyAccounts.cardNumber,
    })
    .from(users)
    .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id));
  return (where ? base.where(where) : base).orderBy(desc(users.createdAt));
}

/** Paginated redemptions list. */
export async function getRedemptionsPage(opts: { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(redemptions)
      .orderBy(desc(redemptions.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(redemptions),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const getRecentLoyaltyTx = (userId: string) =>
  db
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.userId, userId))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(50);

/** Paginated newsletter subscribers list. `confirmed` is the full-table count of
 *  confirmed subscribers (used by the broadcast form / subtitle), independent of paging. */
export const SUBSCRIBER_SORTS = ["email", "stato", "origine", "iscritto"] as const;

export async function getSubscribersPage(opts: SubscriberFilters & { page?: number; sort?: SortSpec }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = subscribersWhere(opts);
  const orderBy = opts.sort
    ? orderByFor(
        opts.sort,
        {
          email: newsletterSubscribers.email,
          stato: newsletterSubscribers.status,
          origine: newsletterSubscribers.source,
          iscritto: newsletterSubscribers.createdAt,
        },
        newsletterSubscribers.createdAt,
      )
    : desc(newsletterSubscribers.createdAt);
  const [rows, [{ total }], [{ confirmed }], sources] = await Promise.all([
    db
      .select()
      .from(newsletterSubscribers)
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(newsletterSubscribers).where(where),
    db
      .select({ confirmed: sql<number>`count(*)` })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.status, "confirmed")),
    db.selectDistinct({ source: newsletterSubscribers.source }).from(newsletterSubscribers),
  ]);
  return {
    rows,
    total,
    confirmed,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    sources: sources.map((s) => s.source).filter((s): s is string => !!s),
  };
}

export const getOutbox = () => db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(200);

/** Paginated + status-filterable email outbox. */
export async function getOutboxPage(opts: OutboxFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = outboxWhere(opts);
  const [rows, [{ total }], [{ failed }]] = await Promise.all([
    db
      .select()
      .from(emailOutbox)
      .where(where)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(emailOutbox).where(where),
    db.select({ failed: sql<number>`count(*)` }).from(emailOutbox).where(eq(emailOutbox.status, "failed")),
  ]);
  return { rows, total, failed, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// ── Filtered exports ─────────────────────────────────────────────────────────
// Unpaginated variants of the list queries, sharing the same WHERE builders, so
// a CSV download returns exactly the rows the operator has filtered to on screen.

export const getOrdersForExport = (f: OrderFilters) =>
  db.select().from(orders).where(ordersWhere(f)).orderBy(desc(orders.createdAt));

export const getReservationsForExport = (f: ReservationFilters) =>
  db
    .select()
    .from(reservations)
    .where(reservationsWhere(f))
    .orderBy(desc(reservations.createdAt));

export const getSubscribersForExport = (f: SubscriberFilters) =>
  db
    .select()
    .from(newsletterSubscribers)
    .where(subscribersWhere(f))
    .orderBy(desc(newsletterSubscribers.createdAt));

export const getAllSettings = () => db.select().from(settings).orderBy(settings.key);

/** Recent stock movements for a product, newest first. */
export const getStockMovements = (productId: string, limit = 20) =>
  db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);

/** All discount codes, newest first. */
export const adminGetDiscounts = () =>
  db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));

/** One discount code by id (or null). */
export async function adminGetDiscount(id: string) {
  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  return row ?? null;
}

/**
 * Paginated audit-log feed, newest first, plus the distinct actors and entities
 * present in the whole log so the filters can offer them.
 */
export async function getAuditPage(opts: AuditFilters & { page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const where = auditWhere(opts);
  const [rows, [{ total }], actors, entities] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(auditLog).where(where),
    db
      .selectDistinct({ id: auditLog.actorId, name: auditLog.actorName })
      .from(auditLog)
      .orderBy(auditLog.actorName),
    db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(auditLog.entity),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    actors: actors.filter((a): a is { id: string; name: string } => !!a.id),
    entities: entities.map((e) => e.entity).filter(Boolean),
  };
}

/** Unpaginated audit feed for the CSV export, honouring the same filters. */
export const getAuditForExport = (f: AuditFilters) =>
  db.select().from(auditLog).where(auditWhere(f)).orderBy(desc(auditLog.createdAt));

/**
 * The timestamp that puts an order in a fiscal period: when it was paid.
 *
 * Orders settled before `paidAt` existed fall back to their creation date, which
 * is the best available approximation for that history and matches how those
 * periods were previously reported.
 */
const fiscalDate = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;

/**
 * IVA report for paid orders whose payment date falls in [from, to]. Buckets are
 * computed **per order** — line grosses, minus that order's discount apportioned
 * across its rate buckets, plus shipping at the configured rate — then aggregated
 * by rate. This makes the taxable base + tax reflect what customers actually paid
 * (a raw line-gross group-by ignored coupons and over-declared VAT).
 *
 * Refunded orders are excluded (paymentStatus = 'paid' only), so the report
 * reflects net taxable takings for the period.
 */
export async function getVatReport(from: Date, to: Date) {
  const shippingVatPct = await getSetting<number>("store.shippingVatRate", 22);
  const shippingVatBps = Math.round(shippingVatPct * 100);

  const paidInRange = and(
    eq(orders.paymentStatus, "paid"),
    sql`${fiscalDate} >= ${from.getTime()}`,
    sql`${fiscalDate} <= ${to.getTime()}`,
  );

  const ords = await db
    .select({
      id: orders.id,
      discountCents: orders.discountCents,
      shippingCents: orders.shippingCents,
    })
    .from(orders)
    .where(paidInRange);

  if (ords.length === 0) return { buckets: [] as VatBucket[], shippingVatBps };

  const items = await db
    .select({
      orderId: orderItems.orderId,
      grossCents: orderItems.lineTotalCents,
      vatRateBps: orderItems.vatRateBps,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, ords.map((o) => o.id)));

  const itemsByOrder = new Map<string, { grossCents: number; vatRateBps: number }[]>();
  for (const it of items) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push({ grossCents: it.grossCents, vatRateBps: it.vatRateBps });
    itemsByOrder.set(it.orderId, arr);
  }

  const perOrder = ords.map((o) =>
    orderVatBuckets({
      items: itemsByOrder.get(o.id) ?? [],
      discountCents: o.discountCents,
      shippingCents: o.shippingCents,
      shippingVatBps,
    }),
  );

  return { buckets: aggregateVatBuckets(perOrder), shippingVatBps };
}
