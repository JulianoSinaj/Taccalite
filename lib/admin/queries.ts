import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

export const PAGE_SIZE = 25;
import { db } from "@/lib/db/client";
import { getSetting } from "@/lib/db/queries";
import {
  orderVatBuckets,
  refundVatBuckets,
  negateVatBuckets,
  aggregateVatBuckets,
  type VatBucket,
} from "@/lib/fiscal";
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
  usersWhere,
  orderByFor,
  type UserFilters,
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
  productBatches,
  savedViews,
} from "@/lib/db/schema";

/**
 * Revenue is money **settled** in a window, net of refunds.
 *
 * Two things used to be wrong here and both flattered the numbers: the window
 * was keyed on `createdAt` (so an order placed on the 31st and paid on the 1st
 * counted in the wrong month, and disagreed with the IVA report, which keys on
 * the payment date), and `refundedCents` was ignored, so a refunded order stayed
 * on the books as takings forever.
 */
const settledAt = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;
const netRevenue = sql<number>`coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0)`;
/** Every order that was ever settled — a refunded one still had a sale. */
const everSettled = inArray(orders.paymentStatus, ["paid", "refunded"]);

export async function getDashboardStats() {
  const [pendingRes] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reservations)
    .where(eq(reservations.status, "pending"));
  const [totalRes] = await db.select({ n: sql<number>`count(*)` }).from(reservations);
  // "Ordini pagati" is the lifetime count of settled orders. It used to run the
  // identical query as "da evadere" below, so the dashboard showed the same
  // number twice under two different labels.
  const [paidOrders] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(eq(orders.paymentStatus, "paid"));
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

  // Actionable work-queue: settled orders still waiting to be handed over.
  const [toFulfil] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), eq(orders.status, "paid")));
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

  // Net revenue over rolling windows, by settlement date (integer cents).
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rev = async (sinceMs: number) => {
    const [r] = await db
      .select({ sum: netRevenue })
      .from(orders)
      .where(and(everSettled, sql`${settledAt} >= ${sinceMs}`));
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

  const sumRev = async (from: Date, to?: Date) => {
    const conds = [everSettled, sql`${settledAt} >= ${from.getTime()}`];
    if (to) conds.push(sql`${settledAt} < ${to.getTime()}`);
    const [r] = await db
      .select({ sum: netRevenue, n: sql<number>`count(*)` })
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

  const [last30, prev30, newCust30, newCustPrev, settledRows, topProducts] = await Promise.all([
    sumRev(p30),
    sumRev(p60, p30),
    countCustomers(p30),
    countCustomers(p60, p30),
    // Bucketed in JS rather than by SQL `date(...)`, which is UTC: the chart sits
    // beside an "Incasso oggi" tile computed from Europe/Rome midnight, and the
    // two used to disagree for late-evening orders. SQLite's 'localtime' would
    // follow the container's TZ (UTC in the image), not the shop's, so the
    // business-timezone helper is the only correct source.
    db
      .select({
        at: sql<number>`${settledAt}`,
        cents: sql<number>`${orders.totalCents} - ${orders.refundedCents}`,
      })
      .from(orders)
      .where(and(everSettled, sql`${settledAt} >= ${p30.getTime()}`)),
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
      .where(and(everSettled, sql`${settledAt} >= ${p30.getTime()}`))
      .groupBy(sql`coalesce(${orderItems.productId}, ${orderItems.name})`)
      .orderBy(desc(sql`sum(${orderItems.lineTotalCents})`))
      .limit(5),
  ]);

  const aovCents = last30.n > 0 ? Math.round(last30.sum / last30.n) : 0;

  // Fill a continuous 30-day series on the Rome calendar so the chart has no gaps
  // and shares its day boundary with the money tiles above it.
  const byDay = new Map<string, number>();
  for (const r of settledRows) {
    const key = dateInRome(new Date(r.at));
    byDay.set(key, (byDay.get(key) ?? 0) + r.cents);
  }
  const dailySeries = Array.from({ length: 30 }, (_, i) => {
    const key = dateInRome(new Date(now - (29 - i) * day));
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

/** One reservation, with the account behind it when there is one. */
export async function adminGetReservation(id: string) {
  const [row] = await db
    .select({
      reservation: reservations,
      customerName: users.name,
      customerUsername: users.username,
    })
    .from(reservations)
    .leftJoin(users, eq(reservations.userId, users.id))
    .where(eq(reservations.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Everything else booked at the same shop on the same day, so the detail page
 * can show what the kitchen and the room are already committed to.
 */
export function getReservationsSameDay(shopSlug: string, date: string, excludeId: string) {
  return db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.shopSlug, shopSlug),
        eq(reservations.date, date),
        sql`${reservations.id} != ${excludeId}`,
        sql`${reservations.status} != 'cancelled'`,
      ),
    )
    .orderBy(reservations.time);
}

/**
 * Active reservations for the agenda / prep sheet.
 *
 * Bounded on purpose. It used to return *every* upcoming booking forever, so the
 * printed sheet grew without limit and couldn't be scoped to "tomorrow" — the
 * question the page is actually opened to answer.
 */
export async function getUpcomingReservations(
  opts: { from?: string; to?: string; shopSlug?: string } = {},
) {
  const from = opts.from ?? dateInRome();
  const conds = [
    gte(reservations.date, from),
    inArray(reservations.status, ["pending", "confirmed"]),
  ];
  if (opts.to) conds.push(sql`${reservations.date} <= ${opts.to}`);
  if (opts.shopSlug && opts.shopSlug !== "all") conds.push(eq(reservations.shopSlug, opts.shopSlug));
  return db
    .select()
    .from(reservations)
    .where(and(...conds))
    .orderBy(reservations.date, reservations.time);
}

export const getOrdersList = (shopSlug?: string) => {
  const q = db.select().from(orders).orderBy(desc(orders.createdAt));
  return shopSlug && shopSlug !== "all" ? q.where(eq(orders.shopSlug, shopSlug)) : q;
};

/** Paginated orders list for the given filters (see `lib/admin/filters`). */
export const ORDER_SORTS = ["data", "numero", "cliente", "totale", "stato"] as const;

export async function getOrdersPage(opts: OrderFilters & { page?: number; sort?: SortSpec }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = ordersWhere(opts);
  const orderBy = opts.sort
    ? orderByFor(
        opts.sort,
        {
          data: orders.createdAt,
          numero: orders.orderNumber,
          cliente: orders.name,
          totale: orders.totalCents,
          stato: orders.status,
        },
        orders.createdAt,
      )
    : desc(orders.createdAt);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(where)
      .orderBy(orderBy)
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

/**
 * Every live product, unpaginated — for pickers (manual order) and selects.
 * Archived products are excluded: they must stay out of anything sellable.
 */
export const adminGetProducts = () =>
  db.select().from(products).where(isNull(products.archivedAt)).orderBy(products.sortOrder);

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
  // Today in the business timezone, so "online" vs "programmato" here matches
  // the gate the public listing applies.
  const where = blogWhere(opts, dateInRome());
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

/**
 * The account columns every admin surface needs.
 *
 * `active`, `emailVerifiedAt` and `totpEnabled` are part of this on purpose: the
 * users page used to run a second query just to learn who was deactivated, and
 * could show neither verification nor 2FA state at all — so an operator could
 * not tell a locked-out account from a live one.
 */
const USER_COLUMNS = {
  id: users.id,
  username: users.username,
  email: users.email,
  name: users.name,
  role: users.role,
  phone: users.phone,
  active: users.active,
  emailVerifiedAt: users.emailVerifiedAt,
  totpEnabled: users.totpEnabled,
  marketingConsent: users.marketingConsent,
  createdAt: users.createdAt,
};

/** Paginated users list with role/status facets and search. */
export async function getUsersPage(opts: UserFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = usersWhere(opts);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(USER_COLUMNS)
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(users).where(where),
  ]);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const adminGetUser = (id: string) =>
  db
    .select(USER_COLUMNS)
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);

/**
 * Lifetime aggregates for one customer: what they've actually been worth.
 *
 * The customer page listed orders but never totalled them, so "is this a good
 * customer?" meant adding up rows by eye. Refunds are netted out — a refunded
 * order is not revenue.
 */
export async function getCustomerStats(userId: string) {
  const [row] = await db
    .select({
      orders: sql<number>`count(*)`,
      spentCents: sql<number>`coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0)`,
      lastOrderAt: sql<number | null>`max(coalesce(${orders.paidAt}, ${orders.createdAt}))`,
    })
    .from(orders)
    .where(and(eq(orders.userId, userId), inArray(orders.paymentStatus, ["paid", "refunded"])));

  const count = row?.orders ?? 0;
  const spentCents = row?.spentCents ?? 0;
  return {
    orders: count,
    spentCents,
    aovCents: count > 0 ? Math.round(spentCents / count) : 0,
    lastOrderAt: row?.lastOrderAt ? new Date(row.lastOrderAt) : null,
  };
}

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

/**
 * Paginated redemptions queue, filterable by status.
 *
 * It was the only list in the admin with no filter and no search, which made it
 * unusable as a work queue the moment fulfilled rows outnumbered pending ones.
 * Defaults to the ones that still need doing.
 */
export async function getRedemptionsPage(opts: { page?: number; stato?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  const where =
    opts.stato && opts.stato !== "all"
      ? eq(redemptions.status, opts.stato as "pending")
      : undefined;
  const [rows, [{ total }], [{ pending }]] = await Promise.all([
    db
      .select({
        redemption: redemptions,
        customerName: users.name,
        customerUsername: users.username,
      })
      .from(redemptions)
      .leftJoin(users, eq(redemptions.userId, users.id))
      .where(where)
      .orderBy(desc(redemptions.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(redemptions).where(where),
    db
      .select({ pending: sql<number>`count(*)` })
      .from(redemptions)
      .where(eq(redemptions.status, "pending")),
  ]);
  return { rows, total, pending, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
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

export const getProductsForExport = (f: ProductFilters, lowStockThreshold: number) =>
  db.select().from(products).where(productsWhere(f, lowStockThreshold)).orderBy(products.sortOrder);

export const getSubscribersForExport = (f: SubscriberFilters) =>
  db
    .select()
    .from(newsletterSubscribers)
    .where(subscribersWhere(f))
    .orderBy(desc(newsletterSubscribers.createdAt));

export const getAllSettings = () => db.select().from(settings).orderBy(settings.key);

/** One user's saved filter presets for one admin list. */
export const getSavedViews = (userId: string, path: string) =>
  db
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.userId, userId), eq(savedViews.path, path)))
    .orderBy(savedViews.createdAt);

// ── Product batches (lot + expiry) ───────────────────────────────────────────
/** Open and recent lots for a product, earliest expiry first (FEFO order). */
export const getProductBatches = (productId: string, limit = 50) =>
  db
    .select()
    .from(productBatches)
    .where(eq(productBatches.productId, productId))
    .orderBy(asc(productBatches.expiryDate), desc(productBatches.createdAt))
    .limit(limit);

/**
 * Lots with stock left that expire on or before `through`, plus anything already
 * past its date. This is the HACCP-facing question — what has to be sold, moved
 * or thrown — and nothing in the admin could answer it before.
 */
export async function getExpiringBatches(through: string, includeExpired = true) {
  const rows = await db
    .select({
      batch: productBatches,
      productName: products.name,
      productSlug: products.slug,
      shopSlug: products.shopSlug,
    })
    .from(productBatches)
    .innerJoin(products, eq(productBatches.productId, products.id))
    .where(
      and(
        sql`${productBatches.remaining} > 0`,
        isNotNull(productBatches.expiryDate),
        sql`${productBatches.expiryDate} <= ${through}`,
        isNull(products.archivedAt),
      ),
    )
    .orderBy(asc(productBatches.expiryDate));
  return includeExpired ? rows : rows.filter((r) => r.batch.expiryDate! >= through);
}

/** How many lots of a product are expiring within `days`, for a badge. */
export async function countExpiringSoon(through: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(productBatches)
    .innerJoin(products, eq(productBatches.productId, products.id))
    .where(
      and(
        sql`${productBatches.remaining} > 0`,
        isNotNull(productBatches.expiryDate),
        sql`${productBatches.expiryDate} <= ${through}`,
        isNull(products.archivedAt),
      ),
    );
  return row?.n ?? 0;
}

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
 * The date a refund belongs to. `refundedAt` exists from migration 0027 on;
 * refunds issued before it fall back to the row's last-touched time, which for a
 * refunded order is in practice the refund itself.
 */
const reversalDate = sql`coalesce(${orders.refundedAt}, ${orders.updatedAt})`;

export type VatReport = {
  /** Sales settled in the period, gross of any later refund. */
  sales: VatBucket[];
  /** Credit notes: money given back **during** the period, as negative buckets. */
  reversals: VatBucket[];
  /** sales + reversals — what the period actually owes. */
  buckets: VatBucket[];
  /** The same net figure split by location (null = shipping / no shop). */
  byShop: { shopSlug: string | null; buckets: VatBucket[] }[];
  shippingVatBps: number;
  /** Order counts behind each side, for the operator's sanity check. */
  salesCount: number;
  reversalCount: number;
};

/** Line grosses per order id, for a set of orders. */
async function itemsForOrders(ids: string[]) {
  const map = new Map<string, { grossCents: number; vatRateBps: number }[]>();
  if (ids.length === 0) return map;
  const items = await db
    .select({
      orderId: orderItems.orderId,
      grossCents: orderItems.lineTotalCents,
      vatRateBps: orderItems.vatRateBps,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));
  for (const it of items) {
    const arr = map.get(it.orderId) ?? [];
    arr.push({ grossCents: it.grossCents, vatRateBps: it.vatRateBps });
    map.set(it.orderId, arr);
  }
  return map;
}

/**
 * IVA report for a period, on an accrual basis with credit notes.
 *
 * Two passes, because a sale and its refund are two fiscal events at two dates:
 *
 *  1. **Sales** — every order *settled* in [from, to), gross of any later
 *     refund. A January sale refunded in March stays in January: the January
 *     return was filed on it, and a report must not silently rewrite a period
 *     that has already been declared.
 *  2. **Reversals** — every order *refunded* in [from, to), as negative buckets
 *     sized to the refunded amount. This is the credit note (nota di credito),
 *     booked where it belongs. A partial refund lands here too, which is what
 *     stops the sale side over-declaring on money that was handed back.
 *
 * Buckets are computed per order (line grosses, minus that order's discount
 * apportioned across its rates, plus shipping at the configured rate), so the
 * taxable base and tax reflect what the customer actually paid.
 *
 * `to` is **exclusive**: callers pass the start of the day after the period, so
 * an order settled at 23:59:59.4 on the last day isn't dropped.
 */
export async function getVatReport(from: Date, to: Date): Promise<VatReport> {
  const shippingVatPct = await getSetting<number>("store.shippingVatRate", 22);
  const shippingVatBps = Math.round(shippingVatPct * 100);

  const cols = {
    id: orders.id,
    discountCents: orders.discountCents,
    shippingCents: orders.shippingCents,
    refundedCents: orders.refundedCents,
    shopSlug: orders.shopSlug,
  };

  const [soldRows, refundedRows] = await Promise.all([
    // Ever-settled orders, so one later refunded still counts as a sale here.
    db
      .select(cols)
      .from(orders)
      .where(
        and(
          inArray(orders.paymentStatus, ["paid", "refunded"]),
          sql`${fiscalDate} >= ${from.getTime()}`,
          sql`${fiscalDate} < ${to.getTime()}`,
        ),
      ),
    db
      .select(cols)
      .from(orders)
      .where(
        and(
          sql`${orders.refundedCents} > 0`,
          sql`${reversalDate} >= ${from.getTime()}`,
          sql`${reversalDate} < ${to.getTime()}`,
        ),
      ),
  ]);

  const ids = [...new Set([...soldRows, ...refundedRows].map((o) => o.id))];
  const itemsByOrder = await itemsForOrders(ids);

  const base = (o: (typeof soldRows)[number]) => ({
    items: itemsByOrder.get(o.id) ?? [],
    discountCents: o.discountCents,
    shippingCents: o.shippingCents,
    shippingVatBps,
  });

  const sales = aggregateVatBuckets(soldRows.map((o) => orderVatBuckets(base(o))));
  const reversals = aggregateVatBuckets(
    refundedRows.map((o) => negateVatBuckets(refundVatBuckets({ ...base(o), refundedCents: o.refundedCents }))),
  );

  // Net per location, so the two shops can be reconciled separately — a single
  // combined figure couldn't answer "how much did the centro take".
  const perShop = new Map<string, VatBucket[][]>();
  const push = (slug: string | null, buckets: VatBucket[]) => {
    const key = slug ?? "";
    perShop.set(key, [...(perShop.get(key) ?? []), buckets]);
  };
  for (const o of soldRows) push(o.shopSlug, orderVatBuckets(base(o)));
  for (const o of refundedRows) {
    push(o.shopSlug, negateVatBuckets(refundVatBuckets({ ...base(o), refundedCents: o.refundedCents })));
  }
  const byShop = [...perShop.entries()]
    .map(([shopSlug, all]) => ({ shopSlug: shopSlug || null, buckets: aggregateVatBuckets(all) }))
    .filter((s) => s.buckets.length > 0)
    .sort((a, b) => (a.shopSlug ?? "").localeCompare(b.shopSlug ?? ""));

  return {
    sales,
    reversals,
    buckets: aggregateVatBuckets([sales, reversals]),
    byShop,
    shippingVatBps,
    salesCount: soldRows.length,
    reversalCount: refundedRows.length,
  };
}
