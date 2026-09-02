import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

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
import { dateInRome, startOfTodayRome, instantInRome, expiryWindow, timeInRome } from "@/lib/time";
import { shiftIsoDate } from "@/lib/agenda-range";
import { shiftDay } from "@/lib/closures";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/mail/mailer";
import {
  ordersWhere,
  reservationsWhere,
  customersWhere,
  customersOrderBy,
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
  categories,
  blogPosts,
  shops,
  rewards,
  users,
  loyaltyAccounts,
  loyaltyTransactions,
  redemptions,
  newsletterSubscribers,
  emailOutbox,
  newsletterCampaigns,
  settings,
  auditLog,
  discountCodes,
  stockMovements,
  productBatches,
  savedViews,
  deliveryZones,
  pickupSlots,
  shopClosures,
  discountRedemptions,
  type CategoryRow,
  type DeliveryZoneRow,
  type PickupSlotRow,
  type ShopClosureRow,
  type OrderRow,
  type ReservationRow,
} from "@/lib/db/schema";
import {
  analyseSales,
  type SaleLine,
  type OrderContext,
  type SalesAnalysis,
} from "@/lib/sales-analysis";

/**
 * Revenue is money **settled** in a window, net of refunds.
 *
 * Two things used to be wrong here and both flattered the numbers: the window
 * was keyed on `createdAt` (so an order placed on the 31st and paid on the 1st
 * counted in the wrong month, and disagreed with the IVA report, which keys on
 * the payment date), and `refundedCents` was ignored, so a refunded order stayed
 * on the books as takings forever.
 */
// Indexed as an expression by `orders_fiscal_date_idx` (drizzle/0033) — keep
// this text identical to the index's or the planner silently reverts to a scan.
const settledAt = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;
const netRevenue = sql<number>`coalesce(sum(${orders.totalCents} - ${orders.refundedCents}), 0)`;
/** Every order that was ever settled — a refunded one still had a sale. */
const everSettled = inArray(orders.paymentStatus, ["paid", "refunded"]);

/**
 * Restrict a query to one location, matching `lib/admin/scope.ts`'s row rule.
 *
 * `null` means the whole business (an admin, or an unassigned account) and adds
 * no predicate. A scoped operator sees their own shop **plus rows that belong to
 * no shop at all** — a courier shipment, a global product — exactly as `inScope`
 * decides it for a single row. Without this the dashboard was titled "la tua
 * giornata" and showed somebody else's.
 */
const inShop = (col: AnyColumn, scope: string | null): SQL | undefined =>
  scope ? or(eq(col, scope), isNull(col)) : undefined;

/**
 * An order somebody still has to hand over — the day sheet's and the
 * dashboard's shared definition.
 *
 * "Paid but not fulfilled" was the definition, and it hid the orders the day
 * sheet exists for: a contrassegno delivery or a "pago in bottega" pickup sits
 * unpaid — status `pending` — until the goods change hands, which is exactly
 * when the driver or the counter needs it listed with its "da incassare". The
 * one unpaid order left out is a *card* checkout nobody completed: no one is
 * coming for it, and the abandoned-order sweep will cancel it.
 */
const liveCheckout = or(ne(orders.paymentMethod, "card"), eq(orders.paymentStatus, "paid"))!;
const liveFulfilmentWork = and(inArray(orders.status, ["pending", "paid"]), liveCheckout)!;

export async function getDashboardStats(scope: string | null = null) {
  const resShop = inShop(reservations.shopSlug, scope);
  const ordShop = inShop(orders.shopSlug, scope);

  // Upcoming only: a request whose day has already passed is not "in attesa"
  // of a decision anyone can still make — it is expired, and the list's
  // "Scadute" facet is where those are dealt with.
  const [pendingRes] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reservations)
    .where(
      and(
        eq(reservations.status, "pending"),
        sql`${reservations.date} >= ${dateInRome()}`,
        resShop,
      ),
    );
  const [totalRes] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reservations)
    .where(resShop);
  // "Ordini pagati" is the lifetime count of settled orders. It used to run the
  // identical query as "da evadere" below, so the dashboard showed the same
  // number twice under two different labels.
  const [paidOrders] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "paid"), ordShop));
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
    .where(and(eq(orders.paymentStatus, "paid"), eq(orders.status, "paid"), ordShop));
  // Today's pickup appointments not yet handed over — the morning's first
  // question, answered here rather than one page away. A Rome day, not a UTC
  // one, for the same reason as the day sheet.
  const todayRome = dateInRome();
  const [pickupsToday] = await db
    .select({ n: sql<number>`count(*)` })
    .from(orders)
    .where(
      and(
        eq(orders.fulfilment, "pickup"),
        gte(orders.pickupSlotAt, instantInRome(todayRome, "00:00")),
        lt(orders.pickupSlotAt, instantInRome(shiftIsoDate(todayRome, 1), "00:00")),
        liveFulfilmentWork,
        ordShop,
      ),
    );
  // Porchetta waitlist awaiting a decision.
  const [waitlisted] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reservations)
    .where(
      and(eq(reservations.waitlisted, true), sql`${reservations.status} != 'cancelled'`, resShop),
    );
  // Failed emails needing attention.
  const [failedEmails] = await db
    .select({ n: sql<number>`count(*)` })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, "failed"));

  // Inventory. The dashboard is the screen the shop opens in the morning and it
  // had nothing about stock on it at all — both of these already existed
  // (`productsWhere`'s low-stock facet, `countExpiringSoon`) and were reachable
  // only by navigating to the catalogue and remembering to look.
  const lowStockThreshold = await getSetting<number>("store.lowStockThreshold", 5);
  const [lowStock] = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(
      and(
        productsWhere({ stato: "attivi", scorte: "basse" }, lowStockThreshold),
        inShop(products.shopSlug, scope),
      ),
    );
  const expiringSoon = await countExpiringSoon(expiryWindow(7), scope);

  // Net revenue over rolling windows, by settlement date (integer cents).
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const rev = async (sinceMs: number) => {
    const [r] = await db
      .select({ sum: netRevenue })
      .from(orders)
      .where(and(everSettled, sql`${settledAt} >= ${sinceMs}`, ordShop));
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
    pickupsToday: pickupsToday?.n ?? 0,
    waitlisted: waitlisted?.n ?? 0,
    failedEmails: failedEmails?.n ?? 0,
    customers: customers?.n ?? 0,
    subscribers: subs?.n ?? 0,
    pendingRedemptions: pendingRedemptions?.n ?? 0,
    lowStock: lowStock?.n ?? 0,
    expiringSoon,
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
export async function getDashboardInsights(scope: string | null = null) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const p30 = new Date(now - 30 * day);
  const p60 = new Date(now - 60 * day);
  const ordShop = inShop(orders.shopSlug, scope);

  const sumRev = async (from: Date, to?: Date) => {
    const conds: (SQL | undefined)[] = [everSettled, sql`${settledAt} >= ${from.getTime()}`, ordShop];
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

  const [last30, prev30, newCust30, newCustPrev, settledRows, sales30] = await Promise.all([
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
      .where(and(everSettled, sql`${settledAt} >= ${p30.getTime()}`, ordShop)),
    // Through the same engine as /admin/reports/vendite, not a second `group by`
    // of its own. It used to be one: the dashboard summed `lineTotalCents` gross
    // of any coupon, while the report allocates each order's discount across its
    // lines — so the same product could head both screens with two different
    // numbers, and the ranking itself could differ on a period with a big
    // coupon. One definition, and the ranking now carries the margin, which is
    // the point: the best-selling product is not necessarily the one to make
    // more of.
    getSalesLines(p30, new Date(now), undefined, scope),
  ]);

  const aovCents = last30.n > 0 ? Math.round(last30.sum / last30.n) : 0;
  const topProducts = analyseSales(sales30.lines, sales30.orders).byProduct.slice(0, 5);

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
    topProducts, // SalesGroup[] — revenue-ranked, each carrying its own margin
  };
}

/** Today's reservations (not cancelled), for the dashboard work list. */
export async function getTodayReservations(scope: string | null = null) {
  const today = dateInRome();
  return db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.date, today),
        sql`${reservations.status} != 'cancelled'`,
        inShop(reservations.shopSlug, scope),
      ),
    )
    .orderBy(reservations.time)
    .limit(20);
}

/** The most recent orders, for the dashboard activity list. */
export async function getRecentOrders(limit = 6, scope: string | null = null) {
  return db
    .select()
    .from(orders)
    .where(inShop(orders.shopSlug, scope))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

// ── Deposits (caparre) ───────────────────────────────────────────────────────
/**
 * Deposit money, which the platform recorded and then counted nowhere.
 *
 * `reservations.depositCents` was written by `setReservationDeposit` and read by
 * exactly two screens, both only to print a label. So there was no answer to
 * "how much caparra are we holding?", and a deposit **forfeited** after a
 * no-show — money the business definitively kept — appeared in no total on any
 * page.
 *
 * Deliberately kept out of the VAT buckets. A caparra confirmatoria sits outside
 * the VAT base until it is applied to a price, and a forfeited one is
 * compensation rather than consideration; inventing an aliquota for either would
 * be worse than the silence it replaces. The IVA report shows these beside its
 * totals, labelled as excluded, so the accountant sees the money and decides.
 */
export type DepositTotals = { cents: number; count: number };

/** Deposits taken and still held — live bookings the shop owes something for. */
export async function getHeldDeposits(scope: string | null = null): Promise<DepositTotals> {
  const [row] = await db
    .select({
      cents: sql<number>`coalesce(sum(${reservations.depositCents}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(reservations)
    .where(
      and(
        isNotNull(reservations.depositPaidAt),
        isNull(reservations.depositForfeitedAt),
        isNull(reservations.depositRefundedAt),
        inArray(reservations.status, ["pending", "confirmed"]),
        inShop(reservations.shopSlug, scope),
      ),
    );
  return { cents: row?.cents ?? 0, count: row?.count ?? 0 };
}

/**
 * Paid deposits on bookings that did not go ahead and nobody has yet said
 * whether the money was returned or kept. Cancelled only: a no-show forfeits
 * automatically, so it never sits in this limbo.
 */
export async function getDepositsAwaitingOutcome(
  scope: string | null = null,
): Promise<DepositTotals> {
  const [row] = await db
    .select({
      cents: sql<number>`coalesce(sum(${reservations.depositCents}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(reservations)
    .where(
      and(
        sql`${reservations.depositCents} > 0`,
        isNotNull(reservations.depositPaidAt),
        isNull(reservations.depositForfeitedAt),
        isNull(reservations.depositRefundedAt),
        eq(reservations.status, "cancelled"),
        inShop(reservations.shopSlug, scope),
      ),
    );
  return { cents: row?.cents ?? 0, count: row?.count ?? 0 };
}

/** Open bookings whose day has passed — the list's "Scadute" facet, counted. */
export async function countExpiredReservations(scope: string | null = null): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(reservations)
    .where(
      and(
        sql`${reservations.date} < ${dateInRome()}`,
        inArray(reservations.status, ["pending", "confirmed"]),
        inShop(reservations.shopSlug, scope),
      ),
    );
  return row?.n ?? 0;
}

/** Deposits collected, forfeited and refunded inside a window, by the date each happened. */
export async function getDepositMovements(
  from: Date,
  toExclusive: Date,
  scope: string | null = null,
): Promise<{ collected: DepositTotals; forfeited: DepositTotals; refunded: DepositTotals }> {
  const between = (col: AnyColumn) =>
    and(
      isNotNull(col),
      gte(col, from),
      lt(col, toExclusive),
      inShop(reservations.shopSlug, scope),
    );
  const sum = async (where: SQL | undefined): Promise<DepositTotals> => {
    const [row] = await db
      .select({
        cents: sql<number>`coalesce(sum(${reservations.depositCents}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(reservations)
      .where(where);
    return { cents: row?.cents ?? 0, count: row?.count ?? 0 };
  };
  const [collected, forfeited, refunded] = await Promise.all([
    sum(between(reservations.depositPaidAt)),
    sum(between(reservations.depositForfeitedAt)),
    sum(between(reservations.depositRefundedAt)),
  ]);
  return { collected, forfeited, refunded };
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
  opts: { from?: string; to?: string; shopSlug?: string; scope?: string | null } = {},
) {
  const from = opts.from ?? dateInRome();
  const conds: (SQL | undefined)[] = [
    gte(reservations.date, from),
    inArray(reservations.status, ["pending", "confirmed"]),
    // The requested shop is a convenience filter; the scope is a boundary.
    inShop(reservations.shopSlug, opts.scope ?? null),
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
      active: users.active,
      createdAt: users.createdAt,
      points: loyaltyAccounts.points,
      cardNumber: loyaltyAccounts.cardNumber,
    })
    .from(users)
    .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id));

  const [rows, [{ total }]] = await Promise.all([
    (where ? base.where(where) : base)
      .orderBy(...customersOrderBy(opts))
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
 * Every category of one kind, in editorial order, for the pickers.
 *
 * `getCategoryVatDefaults()` lived here: it inferred a VAT rate per category by
 * taking the most-used rate among that category's products, which quietly
 * guessed wrong for a mixed category (the live catalogue had Gastronomia at two
 * different rates). The rate is now declared on the category row itself, seeded
 * once from that same inference by migration 0029.
 */
export async function adminGetCategories(kind: "product" | "post") {
  return db
    .select()
    .from(categories)
    .where(eq(categories.kind, kind))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function adminGetCategory(id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return row ?? null;
}

export type CategoryWithUsage = CategoryRow & { usage: number };

/**
 * Categories of one kind with how many rows each holds — the count is what makes
 * a stray typo category visible ("Formaggio · 1 prodotto" next to "Formaggi ·
 * 5") and what the delete guard and the merge picker are driven by.
 */
export async function adminGetCategoriesWithUsage(
  kind: "product" | "post",
): Promise<CategoryWithUsage[]> {
  const rows = await adminGetCategories(kind);
  const counts =
    kind === "product"
      ? await db
          .select({ id: products.categoryId, n: sql<number>`count(*)` })
          .from(products)
          .groupBy(products.categoryId)
      : await db
          .select({ id: blogPosts.categoryId, n: sql<number>`count(*)` })
          .from(blogPosts)
          .groupBy(blogPosts.categoryId);
  const byId = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((r) => ({ ...r, usage: byId.get(r.id) ?? 0 }));
}

/**
 * Rows whose free-text category never matched a category row — the residue of
 * the pre-0029 world (a name edited straight in the DB, or a CSV import naming a
 * category that doesn't exist). Surfaced on the categories page so it can be
 * fixed rather than sitting invisible.
 */
export async function countUnfiled(kind: "product" | "post"): Promise<number> {
  const [r] =
    kind === "product"
      ? await db
          .select({ n: sql<number>`count(*)` })
          .from(products)
          .where(and(isNull(products.categoryId), ne(products.category, "")))
      : await db
          .select({ n: sql<number>`count(*)` })
          .from(blogPosts)
          .where(and(isNull(blogPosts.categoryId), ne(blogPosts.category, "")));
  return Number(r?.n ?? 0);
}

/**
 * Paginated catalogue list. Also returns the distinct categories present in the
 * whole table (not just this page) so the category filter can offer them.
 */
export const PRODUCT_SORTS = ["nome", "prezzo", "giacenza", "categoria", "negozio", "ordine"] as const;

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
          negozio: products.shopSlug,
          ordine: products.sortOrder,
        },
        products.sortOrder,
      )
    : asc(products.sortOrder);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(orderBy, products.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql`count(*)`.mapWith(Number) }).from(products).where(where),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * Chips for the live catalogue: a category that survives only on archived rows
 * is a filter that matches nothing.
 *
 * Its own query rather than a third leg of `getProductsPage`, because it feeds
 * the toolbar, which now renders ahead of the rows (see components/admin/Streamed).
 */
export async function getProductCategoryFacet(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .where(isNull(products.archivedAt))
    .orderBy(products.category);
  return rows.map((c) => c.category).filter(Boolean);
}

/**
 * How many rows sit in each stock state under the current facets — the numbers
 * the scorte chips carry, so "Scorte basse" says how much reordering there is
 * before anyone clicks it. Counted across the whole filtered catalogue, not the
 * page, and ignoring the scorte facet itself.
 */
export async function countProductStockStates(
  f: ProductFilters,
  lowStockThreshold: number,
): Promise<{ basse: number; esaurite: number }> {
  const count = (scorte: string) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(products)
      .where(productsWhere({ ...f, scorte }, lowStockThreshold));
  const [[low], [out]] = await Promise.all([count("basse"), count("esaurite")]);
  return { basse: low?.n ?? 0, esaurite: out?.n ?? 0 };
}

/** Paginated news list, with the distinct categories for the filter chips. */
/**
 * The distinct categories the diary actually uses, for the filter dropdown.
 *
 * Separate from `getBlogPage` because it feeds the page's *chrome*, which now
 * renders before the rows do (see components/admin/Streamed) — bundling it with
 * the row query would have held the toolbar behind the list it filters.
 */
export async function getBlogCategoryFacet(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: blogPosts.category })
    .from(blogPosts)
    .orderBy(blogPosts.category);
  return rows.map((c) => c.category).filter(Boolean);
}

export async function getBlogPage(opts: BlogFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  // Today in the business timezone, so "online" vs "programmato" here matches
  // the gate the public listing applies.
  const where = blogWhere(opts, dateInRome());
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(blogPosts)
      .where(where)
      .orderBy(desc(blogPosts.date))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(blogPosts).where(where),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Paginated rewards catalogue. */
export async function getRewardsPage(opts: RewardFilters & { page?: number; now?: Date }) {
  const page = Math.max(1, opts.page ?? 1);
  const now = opts.now ?? new Date();
  const where = rewardsWhere(opts, now);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        ...getTableColumns(rewards),
        // Outstanding pickups and lifetime claims: the first is what blocks a
        // delete, the second is the only measure of whether a reward works.
        pendingRedemptions: sql<number>`(select count(*) from ${redemptions} where ${redemptions.rewardId} = ${rewards.id} and ${redemptions.status} = 'pending')`,
        totalRedemptions: sql<number>`(select count(*) from ${redemptions} where ${redemptions.rewardId} = ${rewards.id} and ${redemptions.status} <> 'cancelled')`,
      })
      .from(rewards)
      .where(where)
      .orderBy(rewards.sortOrder, rewards.name)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(rewards).where(where),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * Rewards that are switched on but cannot be claimed — sold out, or past their
 * end date.
 *
 * Counted across the whole catalogue, not the current page: these are the
 * numbers the banner and the filter chips carry, and a chip that says "0" while
 * the next page holds three sold-out rewards is worse than no chip. Its own
 * query because it belongs to chrome that renders ahead of the rows (see
 * components/admin/Streamed).
 */
export async function getRewardsAttention(now = new Date()) {
  const [attention] = await db
    .select({
      outOfStock: sql<number>`sum(case when ${rewards.active} and ${rewards.stock} is not null and ${rewards.stock} <= 0 then 1 else 0 end)`,
      expired: sql<number>`sum(case when ${rewards.active} and ${rewards.availableUntil} is not null and ${rewards.availableUntil} < ${now.getTime()} then 1 else 0 end)`,
    })
    .from(rewards);
  return {
    outOfStock: Number(attention?.outOfStock ?? 0),
    expired: Number(attention?.expired ?? 0),
  };
}

/** Paginated discount codes, newest first. */
export async function getDiscountsPage(opts: DiscountFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = discountsWhere(opts);
  // What each code has cost so far, from the redemption ledger. The list used
  // to show a bare use count, which says nothing about what a campaign cost.
  const redeemedCents = sql<number>`coalesce((select sum(${discountRedemptions.amountCents}) from ${discountRedemptions} where ${discountRedemptions.discountCode} = ${discountCodes.code}), 0)`;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ ...getTableColumns(discountCodes), redeemedCents })
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

/** Redemption tallies for one reward's edit page. */
export async function adminGetRewardStats(id: string) {
  const [row] = await db
    .select({
      pending: sql<number>`sum(case when ${redemptions.status} = 'pending' then 1 else 0 end)`,
      fulfilled: sql<number>`sum(case when ${redemptions.status} = 'fulfilled' then 1 else 0 end)`,
      cancelled: sql<number>`sum(case when ${redemptions.status} = 'cancelled' then 1 else 0 end)`,
    })
    .from(redemptions)
    .where(eq(redemptions.rewardId, id));
  return {
    pending: Number(row?.pending ?? 0),
    fulfilled: Number(row?.fulfilled ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
  };
}

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
  shopSlug: users.shopSlug,
  phone: users.phone,
  active: users.active,
  emailVerifiedAt: users.emailVerifiedAt,
  totpEnabled: users.totpEnabled,
  marketingConsent: users.marketingConsent,
  createdAt: users.createdAt,
  // Access state. All three were written by `lib/auth/service` and read by
  // nothing outside it, so the users list — subtitled "ruoli, password e
  // accessi" — could show a role and a password reset and not whether the
  // account could actually get in. "Why can't Maria log in?" had no answer
  // short of the audit log.
  lastLoginAt: users.lastLoginAt,
  failedLoginCount: users.failedLoginCount,
  lockedUntil: users.lockedUntil,
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

/**
 * Points every live account could still spend — the scheme's outstanding
 * liability, which nothing in the admin showed. Deactivated accounts are left
 * out: erasure zeroes them, and a suspended one can't redeem.
 */
export const getLoyaltyOutstanding = () =>
  db
    .select({ points: sql<number>`coalesce(sum(${loyaltyAccounts.points}), 0)` })
    .from(loyaltyAccounts)
    .innerJoin(users, eq(loyaltyAccounts.userId, users.id))
    .where(eq(users.active, true))
    .then((r) => Number(r[0]?.points ?? 0));

export async function getCustomersWithPoints(
  filters: CustomerFilters = {},
  limit?: number,
  offset?: number,
) {
  const where = customersWhere(filters);
  const base = db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      phone: users.phone,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
      points: loyaltyAccounts.points,
      cardNumber: loyaltyAccounts.cardNumber,
    })
    .from(users)
    .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id));
  const ordered = (where ? base.where(where) : base).orderBy(...customersOrderBy(filters));
  // The CSV route streams this a page at a time; the list page takes it whole.
  return limit == null ? ordered : ordered.limit(limit).offset(offset ?? 0);
}

/**
 * Paginated redemptions queue, filterable by status.
 *
 * It was the only list in the admin with no filter and no search, which made it
 * unusable as a work queue the moment fulfilled rows outnumbered pending ones.
 * Defaults to the ones that still need doing.
 */
export async function getRedemptionsPage(opts: { page?: number; stato?: string; q?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  const conds: SQL[] = [];
  if (opts.stato && opts.stato !== "all") conds.push(eq(redemptions.status, opts.stato as "pending"));
  // Who it is for, or what it is: the queue is worked with a customer standing
  // at the counter, and scrolling for their name was the only way to find them.
  if (opts.q) {
    const t = `%${opts.q.toLowerCase()}%`;
    conds.push(or(like(users.name, t), like(users.username, t), like(redemptions.rewardName, t))!);
  }
  const where = conds.length ? and(...conds) : undefined;
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
      .orderBy(desc(redemptions.createdAt), redemptions.id)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)` })
      .from(redemptions)
      .leftJoin(users, eq(redemptions.userId, users.id))
      .where(where),
    db
      .select({ pending: sql<number>`count(*)` })
      .from(redemptions)
      .where(eq(redemptions.status, "pending")),
  ]);
  return { rows, total, pending, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** How much of a customer's ledger the card shows before offering the rest. */
export const LEDGER_PREVIEW = 50;

/**
 * A customer's points ledger, newest first, with its full size — capped at
 * `LEDGER_PREVIEW` unless the page asks for all of it. The cap was silent: a
 * regular's card stopped at fifty rows and nothing said there were more.
 */
export async function getLoyaltyTxForUser(userId: string, opts: { all?: boolean } = {}) {
  const mine = eq(loyaltyTransactions.userId, userId);
  const base = db
    .select()
    .from(loyaltyTransactions)
    .where(mine)
    .orderBy(desc(loyaltyTransactions.createdAt), desc(loyaltyTransactions.id));
  const [rows, [{ total }]] = await Promise.all([
    opts.all ? base : base.limit(LEDGER_PREVIEW),
    db.select({ total: sql<number>`count(*)` }).from(loyaltyTransactions).where(mine),
  ]);
  return { rows, total: Number(total) };
}

/** Paginated newsletter subscribers list. `confirmed` is the full-table count of
 *  confirmed subscribers (used by the broadcast form / subtitle), independent of paging. */
export const SUBSCRIBER_SORTS = ["email", "stato", "origine", "iscritto", "confermato"] as const;

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
          confermato: newsletterSubscribers.confirmedAt,
        },
        newsletterSubscribers.createdAt,
      )
    : desc(newsletterSubscribers.createdAt);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(newsletterSubscribers)
      .where(where)
      .orderBy(orderBy)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(newsletterSubscribers).where(where),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/**
 * The list-wide figures above the subscriber table: how many are confirmed, and
 * the origins the filter offers. Neither depends on the current page, and both
 * belong to chrome that renders ahead of the rows (see components/admin/Streamed).
 */
export async function getSubscriberSummary() {
  const [[{ confirmed }], sources] = await Promise.all([
    db
      .select({ confirmed: sql<number>`count(*)` })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.status, "confirmed")),
    db.selectDistinct({ source: newsletterSubscribers.source }).from(newsletterSubscribers),
  ]);
  return { confirmed, sources: sources.map((s) => s.source).filter((s): s is string => !!s) };
}

export const getOutbox = () => db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(200);

/** Paginated + status-filterable email outbox. */
/**
 * The whole-outbox figures the page's chrome is built from: the banner, the
 * bulk-retry buttons and the per-status chips.
 *
 * Split out of `getOutboxPage` because these feed the header and the segmented
 * control, which now render ahead of the rows (see components/admin/Streamed) —
 * leaving them in the row query held the retry buttons behind the list.
 */
export async function getOutboxSummary(opts: OutboxFilters) {
  const [[{ failed, exhausted }], byStatus] = await Promise.all([
    // `exhausted` is the subset past the retry cap — the ones an ordinary
    // "riprova tutte" deliberately skips, and therefore the only ones that need
    // the counter reset. Counted so the page can say how many rather than
    // offering a blind "force everything".
    db
      .select({
        failed: sql<number>`count(*)`,
        exhausted: sql<number>`sum(case when ${emailOutbox.attempts} >= ${OUTBOX_MAX_ATTEMPTS} then 1 else 0 end)`,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, "failed")),
    // Per-status counts for the segmented control, under every filter except
    // the status itself — so the chips answer "how many of *these* failed".
    db
      .select({ status: emailOutbox.status, n: sql<number>`count(*)` })
      .from(emailOutbox)
      .where(outboxWhere({ ...opts, stato: "all" }))
      .groupBy(emailOutbox.status),
  ]);

  const counts: Record<"all" | "queued" | "sent" | "failed", number> = { all: 0, queued: 0, sent: 0, failed: 0 };
  for (const r of byStatus) {
    counts[r.status] = Number(r.n);
    counts.all += Number(r.n);
  }
  return { failed, exhausted: Number(exhausted ?? 0), counts };
}

/** One campaign's subject, for the active-filter chip on the outbox — chrome,
 *  so it must resolve without waiting on the page of messages. */
export async function getCampaignSubject(id: string): Promise<string | null> {
  const [row] = await db
    .select({ subject: newsletterCampaigns.subject })
    .from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.id, id))
    .limit(1);
  return row?.subject ?? null;
}

export async function getOutboxPage(opts: OutboxFilters & { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where = outboxWhere(opts);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(emailOutbox)
      .where(where)
      .orderBy(desc(emailOutbox.createdAt), emailOutbox.id)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(emailOutbox).where(where),
  ]);

  // Campaign subjects for the rows on this page, plus the active campaign
  // filter, which needs a label even when nothing matches it.
  const campaignIds = [...new Set(rows.map((r) => r.campaignId).filter((v): v is string => !!v))];
  if (opts.campaign && !campaignIds.includes(opts.campaign)) campaignIds.push(opts.campaign);
  const campaigns: Record<string, string> = {};
  if (campaignIds.length > 0) {
    const found = await db
      .select({ id: newsletterCampaigns.id, subject: newsletterCampaigns.subject })
      .from(newsletterCampaigns)
      .where(inArray(newsletterCampaigns.id, campaignIds));
    for (const c of found) campaigns[c.id] = c.subject;
  }

  return {
    rows,
    total,
    campaigns,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// ── Filtered exports ─────────────────────────────────────────────────────────
// Batched variants of the list queries, sharing the same WHERE builders, so a
// CSV download returns exactly the rows the operator has filtered to on screen.
//
// Each takes a limit/offset because the CSV route streams them a page at a time
// (see `streamCsv`) rather than materialising an unbounded result set. Every
// ORDER BY therefore ends in the primary key: the sort columns here all have
// ties (a timestamp to the millisecond, a hand-set sortOrder), and without a
// unique tiebreaker the order is unspecified between batches, so offset paging
// could repeat one row and drop another.

export const getOrdersForExport = (f: OrderFilters, limit: number, offset: number) =>
  db
    .select()
    .from(orders)
    .where(ordersWhere(f))
    .orderBy(desc(orders.createdAt), orders.id)
    .limit(limit)
    .offset(offset);

/**
 * Order **lines**, for the item-level export.
 *
 * The orders CSV has always been one row per order, which answers "how much did
 * we take" and nothing about what was actually sold — so a commercialista
 * wanting the detail, or anyone asking which products moved in a period, had to
 * go product by product through the UI. Joined rather than a second download so
 * each line carries its order's date, customer and status and the file stands
 * on its own.
 *
 * Ordered by the order's key first so a large export batches deterministically
 * (see `streamCsv`), with the line id as the unique tiebreaker.
 */
export const getOrderItemsForExport = (f: OrderFilters, limit: number, offset: number) =>
  db
    .select({
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      customer: orders.name,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      shopSlug: orders.shopSlug,
      productName: orderItems.name,
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      weightKg: orderItems.weightKg,
      unitPriceCents: orderItems.unitPriceCents,
      lineTotalCents: orderItems.lineTotalCents,
      vatRateBps: orderItems.vatRateBps,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(ordersWhere(f))
    .orderBy(desc(orders.createdAt), orders.id, orderItems.id)
    .limit(limit)
    .offset(offset);

/**
 * Who received a given lot.
 *
 * The question a food recall actually asks, and until the movement ledger
 * started recording which lots it drew on there was no way to answer it: the
 * platform knew *when* a lot was consumed and never *who took it away*.
 *
 * Matched on the lot code inside the recorded JSON rather than by a join,
 * because a movement can draw on several lots at once and the code is what is
 * printed on the packaging — it is what somebody holding a recall notice has in
 * their hand. Orders are returned newest first with the contact details needed
 * to actually telephone somebody.
 */
export async function getOrdersForLot(lotCode: string, scope: string | null = null, limit = 200) {
  const code = lotCode.trim();
  if (!code) return [];
  return db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      customerName: orders.name,
      email: orders.email,
      phone: orders.phone,
      status: orders.status,
      shopSlug: orders.shopSlug,
      productName: products.name,
      movedAt: stockMovements.createdAt,
      lots: stockMovements.lots,
    })
    .from(stockMovements)
    .innerJoin(orders, eq(stockMovements.orderId, orders.id))
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .where(
      and(
        isNotNull(stockMovements.orderId),
        // The lot codes live in a JSON array on the row; SQLite has no operator
        // for "array contains" without json_each, and a LIKE on the serialised
        // text is exact enough because a code is quoted in it.
        sql`${stockMovements.lots} like ${'%"lotCode":"' + code.replace(/[%_]/g, "") + '"%'}`,
        // A recall list names customers, so it is bound by the same sede
        // boundary as every other list an operator can open.
        inShop(products.shopSlug, scope),
      ),
    )
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

/**
 * Products whose movement ledger no longer sums to their on-hand figure.
 *
 * The ledger's whole promise is that the history explains the balance, and
 * nothing ever checked it. `applyOrderStock` claims `stockAppliedAt` *before*
 * doing the work, so a failure part-way through a multi-product order leaves
 * some products decremented and some not, permanently and unretryably — logged
 * since the system 2 audit, but only findable by reading logs. Anything else
 * that ever writes `products.stock` outside `lib/stock.ts` would show up here
 * too, which is the point: this is the check that makes the invariant an
 * invariant rather than an intention.
 *
 * Migration 0048 gave every legacy product an opening balance, so a divergence
 * now means a real one rather than a product that predates the ledger.
 *
 * Scoped like every other list: an operator sees their own sede's shelves.
 */
export async function getStockDivergences(scope: string | null = null) {
  // A grouped join rather than a correlated subquery: the same `sql` fragment
  // reused in both the projection and the predicate came back null in the
  // projection while filtering correctly, which is a difference no reader
  // should have to know about.
  const ledger = sql<number>`coalesce(sum(${stockMovements.delta}), 0)`;

  return db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      shopSlug: products.shopSlug,
      onHand: products.stock,
      ledger,
    })
    .from(products)
    .leftJoin(stockMovements, eq(stockMovements.productId, products.id))
    .where(
      and(
        isNotNull(products.stock),
        isNull(products.archivedAt),
        inShop(products.shopSlug, scope),
      ),
    )
    .groupBy(products.id)
    .having(sql`${products.stock} <> coalesce(sum(${stockMovements.delta}), 0)`)
    .orderBy(products.name);
}

/** The lots a single order drew on, for its detail page. */
export async function getLotsForOrder(orderId: string) {
  const rows = await db
    .select({
      productName: products.name,
      delta: stockMovements.delta,
      lots: stockMovements.lots,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .where(and(eq(stockMovements.orderId, orderId), isNotNull(stockMovements.lots)))
    .orderBy(products.name);
  return rows.filter((r) => (r.lots?.length ?? 0) > 0);
}

/**
 * The inventory ledger. Every movement with the product it moved and who
 * caused it — the record a stocktake is reconciled against, and the only one
 * that could explain a discrepancy. It was readable twenty rows at a time on a
 * product page and could not be taken anywhere.
 */
export const getStockMovementsForExport = (limit: number, offset: number, productId?: string) =>
  db
    .select({
      createdAt: stockMovements.createdAt,
      productName: products.name,
      sku: products.sku,
      shopSlug: products.shopSlug,
      delta: stockMovements.delta,
      stockAfter: stockMovements.stockAfter,
      reason: stockMovements.reason,
      lots: stockMovements.lots,
      actor: users.name,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .leftJoin(users, eq(stockMovements.createdByUserId, users.id))
    // One product's full ledger, for the page that can only show its last 20.
    .where(productId ? eq(stockMovements.productId, productId) : undefined)
    .orderBy(desc(stockMovements.createdAt), stockMovements.id)
    .limit(limit)
    .offset(offset);

/**
 * Lots and their expiry dates — the HACCP traceability record.
 *
 * Which lot of which supplier's product was on the counter on a given day is
 * the question an inspection or a recall asks, and the answer lived only in the
 * batch panel of one product at a time.
 */
export const getBatchesForExport = (limit: number, offset: number) =>
  db
    .select({
      productName: products.name,
      sku: products.sku,
      lotCode: productBatches.lotCode,
      expiryDate: productBatches.expiryDate,
      quantity: productBatches.quantity,
      remaining: productBatches.remaining,
      supplier: productBatches.supplier,
      unitCostCents: productBatches.unitCostCents,
      receivedAt: productBatches.receivedAt,
      note: productBatches.note,
    })
    .from(productBatches)
    .innerJoin(products, eq(productBatches.productId, products.id))
    .orderBy(desc(productBatches.receivedAt), productBatches.id)
    .limit(limit)
    .offset(offset);

/** The points ledger: every accrual and debit, with the customer it belongs to. */
export const getLoyaltyForExport = (limit: number, offset: number) =>
  db
    .select({
      createdAt: loyaltyTransactions.createdAt,
      customer: users.name,
      username: users.username,
      cardNumber: loyaltyAccounts.cardNumber,
      delta: loyaltyTransactions.delta,
      balanceAfter: loyaltyTransactions.balanceAfter,
      reason: loyaltyTransactions.reason,
    })
    .from(loyaltyTransactions)
    .innerJoin(users, eq(loyaltyTransactions.userId, users.id))
    .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id))
    .orderBy(desc(loyaltyTransactions.createdAt), loyaltyTransactions.id)
    .limit(limit)
    .offset(offset);

/** Coupon usage: which code, on which order, for how much. */
export const getDiscountUsageForExport = (limit: number, offset: number) =>
  db
    .select({
      createdAt: discountRedemptions.createdAt,
      code: discountRedemptions.discountCode,
      orderNumber: orders.orderNumber,
      email: discountRedemptions.email,
      amountCents: discountRedemptions.amountCents,
    })
    .from(discountRedemptions)
    .leftJoin(orders, eq(discountRedemptions.orderId, orders.id))
    .orderBy(desc(discountRedemptions.createdAt), discountRedemptions.id)
    .limit(limit)
    .offset(offset);

export const getReservationsForExport = (f: ReservationFilters, limit: number, offset: number) =>
  db
    .select()
    .from(reservations)
    .where(reservationsWhere(f))
    .orderBy(desc(reservations.createdAt), reservations.id)
    .limit(limit)
    .offset(offset);

export const getProductsForExport = (
  f: ProductFilters,
  lowStockThreshold: number,
  limit: number,
  offset: number,
) =>
  db
    .select()
    .from(products)
    .where(productsWhere(f, lowStockThreshold))
    .orderBy(products.sortOrder, products.id)
    .limit(limit)
    .offset(offset);

export const getSubscribersForExport = (f: SubscriberFilters, limit: number, offset: number) =>
  db
    .select()
    .from(newsletterSubscribers)
    .where(subscribersWhere(f))
    .orderBy(desc(newsletterSubscribers.createdAt), newsletterSubscribers.id)
    .limit(limit)
    .offset(offset);

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
export async function getExpiringBatches(
  through: string,
  includeExpired = true,
  scope: string | null = null,
) {
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
        inShop(products.shopSlug, scope),
      ),
    )
    .orderBy(asc(productBatches.expiryDate));
  return includeExpired ? rows : rows.filter((r) => r.batch.expiryDate! >= through);
}

/** How many lots of a product are expiring within `days`, for a badge. */
export async function countExpiringSoon(
  through: string,
  scope: string | null = null,
): Promise<number> {
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
        inShop(products.shopSlug, scope),
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

/**
 * The history that stands between a product and permanent deletion.
 *
 * `deleteProduct` refuses once either count is non-zero — deleting cascades the
 * movement ledger away and would blank the name on past order lines. The detail
 * page asks first so it can offer the button only where it can succeed, the way
 * /admin/categories does with its own foreign key.
 */
export async function getProductHistoryCounts(
  productId: string,
): Promise<{ sold: number; movements: number }> {
  const [[sold], [movements]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(orderItems)
      .where(eq(orderItems.productId, productId)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId)),
  ]);
  return { sold: sold?.n ?? 0, movements: movements?.n ?? 0 };
}

/**
 * How much of one product actually sold in a window, and for how much.
 *
 * The product page could show a margin and a movement ledger and never answer
 * "does this sell?" — the only velocity figure anywhere was the dashboard's
 * top-five, which by definition says nothing about the other several hundred
 * products. That is the number a reorder decision is made on.
 *
 * Counted on settled orders and by the settlement date, like every other money
 * figure here, so it reconciles with the takings rather than with when a basket
 * happened to be created.
 */
export async function getProductSales(
  productId: string,
  days = 30,
): Promise<{ units: number; weightKg: number; cents: number; orders: number }> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const [row] = await db
    .select({
      units: sql<number>`coalesce(sum(case when ${orderItems.weightKg} is null then ${orderItems.quantity} else 0 end), 0)`,
      weightKg: sql<number>`coalesce(sum(coalesce(${orderItems.weightKg}, 0)), 0)`,
      cents: sql<number>`coalesce(sum(${orderItems.lineTotalCents}), 0)`,
      orders: sql<number>`count(distinct ${orderItems.orderId})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(eq(orderItems.productId, productId), everSettled, sql`${settledAt} >= ${since}`),
    );
  return {
    units: row?.units ?? 0,
    weightKg: row?.weightKg ?? 0,
    cents: row?.cents ?? 0,
    orders: row?.orders ?? 0,
  };
}

/** One discount code by id (or null). */
export async function adminGetDiscount(id: string) {
  const [row] = await db.select().from(discountCodes).where(eq(discountCodes.id, id)).limit(1);
  return row ?? null;
}

/**
 * One entry per actor, labelled with the name they most recently acted under.
 *
 * Kept in TypeScript rather than SQL on purpose: the equivalent correlated
 * subquery reads fine on its own but did not survive the query builder — it
 * came back labelling every actor with the same name — and this list is a
 * handful of rows, so there is nothing to win by pushing it down.
 */
function dedupeActors(
  rows: { id: string | null; name: string | null; lastAt: number | null }[],
): { id: string; name: string }[] {
  const best = new Map<string, { name: string; at: number }>();
  for (const r of rows) {
    if (!r.id) continue;
    const at = r.lastAt ?? 0;
    const seen = best.get(r.id);
    // `>=` so a tie resolves to the later row rather than leaving a blank name
    // standing over a real one.
    if (!seen || at >= seen.at) best.set(r.id, { name: r.name ?? r.id, at });
  }
  return [...best.entries()]
    .map(([id, v]) => ({ id, name: v.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "it"));
}

/**
 * Paginated audit-log feed, newest first, plus the distinct actors and entities
 * present in the whole log so the filters can offer them.
 */
/**
 * The filter dropdowns above the activity log: who has ever acted, and on what.
 *
 * Its own query rather than a leg of `getAuditPage`, because it feeds the
 * toolbar — which renders ahead of the entries now (see components/admin/Streamed).
 */
export async function getAuditFacets() {
  const [actors, entities] = await Promise.all([
    // Every (actor, name) pair with the last time that name was used. Reduced to
    // one row per actor below — `selectDistinct` on the pair returned them all,
    // so anyone ever renamed (the demo admin is logged under two names) appeared
    // twice in the filter, and React warned about the duplicate key behind it.
    db
      .select({
        id: auditLog.actorId,
        name: auditLog.actorName,
        lastAt: sql<number>`max(${auditLog.createdAt})`,
      })
      .from(auditLog)
      .groupBy(auditLog.actorId, auditLog.actorName),
    db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(auditLog.entity),
  ]);
  return {
    actors: dedupeActors(actors),
    entities: entities.map((e) => e.entity).filter(Boolean),
  };
}

export async function getAuditPage(opts: AuditFilters & { page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const where = auditWhere(opts);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(auditLog).where(where),
  ]);
  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Batched audit feed for the CSV export, honouring the same filters. */
export const getOutboxForExport = (f: OutboxFilters, limit: number, offset: number) =>
  db
    .select({
      id: emailOutbox.id,
      createdAt: emailOutbox.createdAt,
      sentAt: emailOutbox.sentAt,
      toAddress: emailOutbox.toAddress,
      subject: emailOutbox.subject,
      status: emailOutbox.status,
      attempts: emailOutbox.attempts,
      error: emailOutbox.error,
      campaignId: emailOutbox.campaignId,
    })
    .from(emailOutbox)
    .where(outboxWhere(f))
    .orderBy(desc(emailOutbox.createdAt), emailOutbox.id)
    .limit(limit)
    .offset(offset);

export const getAuditForExport = (f: AuditFilters, limit: number, offset: number) =>
  db
    .select()
    .from(auditLog)
    .where(auditWhere(f))
    .orderBy(desc(auditLog.createdAt), auditLog.id)
    .limit(limit)
    .offset(offset);

/**
 * The timestamp that puts an order in a fiscal period: when it was paid.
 *
 * Orders settled before `paidAt` existed fall back to their creation date, which
 * is the best available approximation for that history and matches how those
 * periods were previously reported.
 */
// Indexed as an expression by `orders_fiscal_date_idx` (drizzle/0033) — keep
// this text identical to the index's or the planner silently reverts to a scan.
const fiscalDate = sql`coalesce(${orders.paidAt}, ${orders.createdAt})`;

/**
 * The date a refund belongs to. `refundedAt` exists from migration 0027 on;
 * refunds issued before it fall back to the row's last-touched time, which for a
 * refunded order is in practice the refund itself.
 */
// Indexed as an expression by `orders_reversal_date_idx` (drizzle/0033) — keep
// this text identical to the index's or the planner silently reverts to a scan.
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
// ── Invoice register (registro fatture) ──────────────────────────────────────
/**
 * Which sales have had a document generated, and which have not.
 *
 * FatturaPA XML was generated on demand per order and the generation was logged,
 * but there was no register: no list of documents issued, no way to see which
 * orders are still waiting for one, and nothing to hand a commercialista asking
 * "what did you issue in July?". The audit log holds the answer — every
 * generation writes an `invoice.xml` or `invoice.credit_note_xml` row against
 * the order id — so the register can be assembled without a new table.
 *
 * What this is NOT: a progressive, gap-free numbering register. The document
 * number is the order number, which is random by design. Changing that is a
 * schema decision with a migration behind it; the page says so rather than
 * implying an authority it does not have.
 */
export type InvoiceRegisterRow = {
  orderId: string;
  orderNumber: string;
  name: string;
  settledAt: Date | null;
  totalCents: number;
  refundedCents: number;
  shopSlug: string | null;
  /** Buyer fiscal identity present — without one the XML is refused. */
  hasFiscalIdentity: boolean;
  invoicedAt: Date | null;
  creditNoteAt: Date | null;
};

export async function getInvoiceRegister(
  from: Date,
  toExclusive: Date,
  scope: string | null = null,
): Promise<InvoiceRegisterRow[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      name: orders.name,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      totalCents: orders.totalCents,
      refundedCents: orders.refundedCents,
      shopSlug: orders.shopSlug,
      customerTaxCode: orders.customerTaxCode,
      customerVatNumber: orders.customerVatNumber,
    })
    .from(orders)
    .where(
      and(
        everSettled,
        sql`${settledAt} >= ${from.getTime()}`,
        sql`${settledAt} < ${toExclusive.getTime()}`,
        inShop(orders.shopSlug, scope),
      ),
    )
    .orderBy(sql`${settledAt}`, orders.id);
  if (rows.length === 0) return [];

  // When each document was generated, newest wins — a re-download of the same
  // invoice is not a second document.
  const issued = await db
    .select({
      entityId: auditLog.entityId,
      action: auditLog.action,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.action, ["invoice.xml", "invoice.credit_note_xml"]),
        inArray(
          auditLog.entityId,
          rows.map((r) => r.orderId),
        ),
      ),
    );
  const invoiced = new Map<string, Date>();
  const credited = new Map<string, Date>();
  for (const e of issued) {
    if (!e.entityId || !e.createdAt) continue;
    const target = e.action === "invoice.credit_note_xml" ? credited : invoiced;
    const seen = target.get(e.entityId);
    if (!seen || e.createdAt > seen) target.set(e.entityId, e.createdAt);
  }

  return rows.map((r) => ({
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    name: r.name,
    settledAt: r.paidAt ?? r.createdAt,
    totalCents: r.totalCents,
    refundedCents: r.refundedCents,
    shopSlug: r.shopSlug,
    hasFiscalIdentity: !!(r.customerTaxCode || r.customerVatNumber),
    invoicedAt: invoiced.get(r.orderId) ?? null,
    creditNoteAt: credited.get(r.orderId) ?? null,
  }));
}

// ── Cash-up (chiusura di cassa) ──────────────────────────────────────────────
/**
 * What was taken in a day, split by the instrument the money arrived on.
 *
 * `orders.paidWith` has been captured on every settlement since the offline
 * payment cycle shipped, and was read in exactly two places: the invoice's
 * `ModalitaPagamento` and one label on the order detail. It was in no filter, no
 * export and no total — so the gestionale could not answer the question a shop
 * asks at closing time every single day: how much is in the till in cash, and
 * how much went through the POS. "Incasso oggi" on the dashboard is one
 * undifferentiated number, which is exactly the number you cannot count against
 * a drawer.
 *
 * Sales and refunds are counted on their own dates, like the IVA report: money
 * handed back today is today's shortfall even when the sale was last month.
 * `paidWith` is null on older rows and on anything settled before the column
 * existed, which is reported as its own bucket rather than folded into cash —
 * guessing here would put phantom notes in the drawer.
 */
export type CashUpRow = {
  instrument: string | null;
  takenCents: number;
  refundedCents: number;
  orders: number;
};

export async function getCashUp(
  fromMs: number,
  toMs: number,
  shopSlug?: string,
  scope: string | null = null,
): Promise<{ rows: CashUpRow[]; takenCents: number; refundedCents: number; orders: number }> {
  const atShop = and(
    shopSlug && shopSlug !== "all" ? eq(orders.shopSlug, shopSlug) : undefined,
    inShop(orders.shopSlug, scope),
  );

  const [taken, refunded] = await Promise.all([
    db
      .select({
        instrument: orders.paidWith,
        cents: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
        n: sql<number>`count(*)`,
      })
      .from(orders)
      .where(
        and(everSettled, sql`${settledAt} >= ${fromMs}`, sql`${settledAt} < ${toMs}`, atShop),
      )
      .groupBy(orders.paidWith),
    db
      .select({
        instrument: orders.paidWith,
        cents: sql<number>`coalesce(sum(${orders.refundedCents}), 0)`,
      })
      .from(orders)
      .where(
        and(
          sql`${orders.refundedCents} > 0`,
          sql`${reversalDate} >= ${fromMs}`,
          sql`${reversalDate} < ${toMs}`,
          atShop,
        ),
      )
      .groupBy(orders.paidWith),
  ]);

  const byInstrument = new Map<string, CashUpRow>();
  const key = (i: string | null) => i ?? "";
  for (const t of taken) {
    byInstrument.set(key(t.instrument), {
      instrument: t.instrument,
      takenCents: t.cents,
      refundedCents: 0,
      orders: t.n,
    });
  }
  for (const r of refunded) {
    const existing = byInstrument.get(key(r.instrument));
    if (existing) existing.refundedCents += r.cents;
    else
      byInstrument.set(key(r.instrument), {
        instrument: r.instrument,
        takenCents: 0,
        refundedCents: r.cents,
        orders: 0,
      });
  }

  const rows = [...byInstrument.values()].sort(
    (a, b) => b.takenCents - a.takenCents || (a.instrument ?? "").localeCompare(b.instrument ?? ""),
  );
  return {
    rows,
    takenCents: rows.reduce((s, r) => s + r.takenCents, 0),
    refundedCents: rows.reduce((s, r) => s + r.refundedCents, 0),
    orders: rows.reduce((s, r) => s + r.orders, 0),
  };
}

// ── Fulfilment ───────────────────────────────────────────────────────────────

export type ZoneWithUsage = DeliveryZoneRow & { orderCount: number };

/**
 * Every zone, active or not, with how many orders were priced by it.
 *
 * The count is what makes the delete button honest: the foreign key is RESTRICT,
 * so a zone that has ever served an order cannot be removed, and the list says so
 * before the operator finds out from a constraint error.
 */
export async function adminGetDeliveryZones(): Promise<ZoneWithUsage[]> {
  const rows = await db
    .select()
    .from(deliveryZones)
    .orderBy(asc(deliveryZones.mode), asc(deliveryZones.sortOrder), asc(deliveryZones.name));
  const counts = await db
    .select({ id: orders.deliveryZoneId, n: sql<number>`count(*)` })
    .from(orders)
    .where(isNotNull(orders.deliveryZoneId))
    .groupBy(orders.deliveryZoneId);
  const byId = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return rows.map((z) => ({ ...z, orderCount: byId.get(z.id) ?? 0 }));
}

export type ClosureWithBookings = ShopClosureRow & {
  /** Live bookings the closure actually lands on — its flags and hours respected. */
  reservationCount: number;
  pickupCount: number;
  /** Of those, the ones with an address that "avvisa i clienti" would still write to. */
  toNotify: number;
};

export type ClosureBookings = { reservations: ReservationRow[]; pickups: OrderRow[] };

/**
 * The live bookings a closure lands on — what the page counts and what the
 * notice is sent to, from one predicate so the two can never disagree.
 *
 * Only the services the closure stops are looked at: a closure of the counter
 * alone leaves the table bookings alone, so they are not "affected". A
 * partial-day closure catches only the bookings timed inside its window; a
 * booking with no time on such a day is left alone, as the gate leaves it.
 */
export async function closureBookings(c: ShopClosureRow): Promise<ClosureBookings> {
  const partial = !!(c.startTime && c.endTime);
  const inWindow = (t: string) => !partial || (t >= c.startTime! && t < c.endTime!);
  const [res, pick] = await Promise.all([
    c.blocksReservations
      ? db
          .select()
          .from(reservations)
          .where(
            and(
              gte(reservations.date, c.fromDate),
              lte(reservations.date, c.toDate),
              sql`${reservations.status} not in ('cancelled', 'no_show')`,
              // A null `shopSlug` on the closure means every location — the same
              // rule `closureFor` applies when it refuses a date.
              c.shopSlug ? eq(reservations.shopSlug, c.shopSlug) : undefined,
            ),
          )
      : Promise.resolve([] as ReservationRow[]),
    c.blocksPickup
      ? db
          .select()
          .from(orders)
          .where(
            and(
              isNotNull(orders.pickupSlotAt),
              // Pickups are stored as an instant, so the range is compared as
              // one: from midnight on the first day to midnight after the last.
              gte(orders.pickupSlotAt, instantInRome(c.fromDate, "00:00")),
              lt(orders.pickupSlotAt, instantInRome(shiftDay(c.toDate, 1), "00:00")),
              // Handed over, cancelled or refunded: nothing left to collect.
              sql`${orders.status} not in ('cancelled', 'refunded', 'fulfilled')`,
              c.shopSlug ? eq(orders.shopSlug, c.shopSlug) : undefined,
            ),
          )
      : Promise.resolve([] as OrderRow[]),
  ]);
  return {
    reservations: res.filter((r) => (partial ? !!r.time && inWindow(r.time) : true)),
    pickups: pick.filter((o) => !partial || inWindow(timeInRome(o.pickupSlotAt!))),
  };
}

/**
 * Which of a closure's bookings the next notice run would write to: those with
 * an address, taken since the last run. That is what makes the button safe to
 * press twice — the second press reaches only whoever booked in between.
 */
export function closureToNotify(c: ShopClosureRow, b: ClosureBookings): ClosureBookings {
  const since = c.notifiedAt?.getTime() ?? 0;
  const fresh = (createdAt: Date | null) => (createdAt?.getTime() ?? 0) > since;
  return {
    reservations: b.reservations.filter((r) => !!r.email && fresh(r.createdAt)),
    pickups: b.pickups.filter((o) => !!o.email && fresh(o.createdAt)),
  };
}

/**
 * Closures under way or ahead, soonest first, each with what is already booked
 * inside it.
 *
 * Declaring a closure deliberately does **not** cancel anything: a shop that
 * marks Ferragosto in July must not silently drop the four bookings already
 * taken for it, and the customers are expecting the shop to keep them. So the
 * count is the whole point of this query — it is the difference between "the
 * day is now closed" and "the day is now closed and here are the four people
 * you need to ring".
 */
export async function adminGetClosures(today?: string): Promise<ClosureWithBookings[]> {
  const from = today ?? dateInRome();
  const rows = await db
    .select()
    .from(shopClosures)
    .where(gte(shopClosures.toDate, from))
    .orderBy(asc(shopClosures.fromDate), asc(shopClosures.toDate), asc(shopClosures.shopSlug));

  return Promise.all(
    rows.map(async (c) => {
      const b = await closureBookings(c);
      const n = closureToNotify(c, b);
      return {
        ...c,
        reservationCount: b.reservations.length,
        pickupCount: b.pickups.length,
        toNotify: n.reservations.length + n.pickups.length,
      };
    }),
  );
}

/** Closures already over, most recent first — the history the page can unfold. */
export async function adminGetPastClosures(today?: string, limit = 60): Promise<ShopClosureRow[]> {
  const from = today ?? dateInRome();
  return db
    .select()
    .from(shopClosures)
    .where(lt(shopClosures.toDate, from))
    .orderBy(desc(shopClosures.toDate), asc(shopClosures.shopSlug))
    .limit(limit);
}

/**
 * The closure the dashboard should mention: one under way, or the first to
 * start within `withinDays`. Narrowed to the viewer's location when they have
 * one — the other shop's refit is not their morning.
 */
export async function adminGetNextClosure(
  scope: string | null,
  withinDays = 14,
  today?: string,
): Promise<ShopClosureRow | null> {
  const from = today ?? dateInRome();
  const [row] = await db
    .select()
    .from(shopClosures)
    .where(
      and(
        gte(shopClosures.toDate, from),
        lte(shopClosures.fromDate, shiftDay(from, withinDays)),
        scope ? or(isNull(shopClosures.shopSlug), eq(shopClosures.shopSlug, scope)) : undefined,
      ),
    )
    .orderBy(asc(shopClosures.fromDate))
    .limit(1);
  return row ?? null;
}

/** Every pickup window, active or not, in schedule order. */
export async function adminGetPickupSlots(): Promise<PickupSlotRow[]> {
  return db
    .select()
    .from(pickupSlots)
    .orderBy(asc(pickupSlots.shopSlug), asc(pickupSlots.weekday), asc(pickupSlots.startTime));
}

/** One line of an order, as the sheet prints it so the bag can be packed from it. */
export type FulfilmentLine = {
  name: string;
  quantity: number;
  /** Set for a line weighed on the scale; `quantity` is then 1 and says nothing. */
  weightKg: number | null;
};

export type FulfilmentDay = {
  /** Pickups booked into a window in the range, earliest first, collected or not. */
  pickups: OrderRow[];
  /** Live pickups with no window at all (the standing backlog). */
  unscheduled: OrderRow[];
  /** Live local deliveries not yet handed over, whatever day they were placed. */
  deliveries: OrderRow[];
  /** Live courier orders still to be packed and given a tracking number. */
  shipments: OrderRow[];
  /** The lines of every order above, by order id. */
  lines: Map<string, FulfilmentLine[]>;
  /**
   * True when a queue hit its cap and is showing only part of itself.
   *
   * The three backlog queues are capped at 100 rows, and the page printed the
   * returned length as the section count — so past the cap the header stated a
   * number that was not true, on the one screen whose job is to say what still
   * has to leave the shop.
   */
  truncated: boolean;
};

/** How many rows each standing backlog queue returns before it is truncated. */
const QUEUE_LIMIT = 100;

/**
 * Everything the counter has to physically do, for one day (or a week of them).
 *
 * The lists are deliberately scoped differently, because the work is: a pickup
 * is an appointment and belongs to its day, while a delivery or a shipment is a
 * queue that has to be emptied regardless of when it was placed — showing only
 * today's would hide yesterday's unshipped order, which is exactly the one that
 * matters.
 *
 * "Live" is `liveFulfilmentWork`: pending or paid, minus abandoned card
 * checkouts. The day's pickups additionally keep the ones already collected,
 * so the sheet reads as the day's list rather than shrinking as the morning
 * goes on; an unpaid card order is dropped there too, or the counter would be
 * told to collect for a checkout that was never finished.
 */
export async function getFulfilmentDay(
  fromMs: number,
  toMs: number,
  shopSlug?: string,
  scope: string | null = null,
): Promise<FulfilmentDay> {
  const onTheDay = and(notInArray(orders.status, ["cancelled", "refunded"]), liveCheckout)!;
  // Two different things stacked on the same column: `shopSlug` is what the
  // operator asked to see, `scope` is what they are allowed to see. A row with
  // no location — a courier shipment, a zone no sede drives — belongs to the
  // business as a whole and stays in view whichever sede is picked, exactly as
  // `inShop` treats it: filtering it out made every shipment vanish the moment
  // a sede was chosen.
  const atShop = (extra: SQL) =>
    and(
      extra,
      shopSlug && shopSlug !== "all"
        ? or(eq(orders.shopSlug, shopSlug), isNull(orders.shopSlug))
        : undefined,
      inShop(orders.shopSlug, scope),
    )!;

  const [pickups, unscheduled, deliveries, shipments] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(
        atShop(
          and(
            eq(orders.fulfilment, "pickup"),
            gte(orders.pickupSlotAt, new Date(fromMs)),
            lt(orders.pickupSlotAt, new Date(toMs)),
            onTheDay,
          )!,
        ),
      )
      .orderBy(asc(orders.pickupSlotAt), asc(orders.createdAt)),
    db
      .select()
      .from(orders)
      .where(
        atShop(and(eq(orders.fulfilment, "pickup"), isNull(orders.pickupSlotAt), liveFulfilmentWork)!),
      )
      .orderBy(asc(orders.createdAt))
      .limit(QUEUE_LIMIT),
    db
      .select()
      .from(orders)
      .where(atShop(and(eq(orders.fulfilment, "delivery"), liveFulfilmentWork)!))
      .orderBy(asc(orders.createdAt))
      .limit(QUEUE_LIMIT),
    db
      .select()
      .from(orders)
      .where(atShop(and(eq(orders.fulfilment, "shipping"), liveFulfilmentWork)!))
      .orderBy(asc(orders.createdAt))
      .limit(QUEUE_LIMIT),
  ]);

  // What is in each bag, in one query rather than one per row. The sheet is
  // what the counter packs from, and it printed a name and a total: the lines
  // were a click away, on a screen nobody has open at the scale.
  const ids = [...pickups, ...unscheduled, ...deliveries, ...shipments].map((o) => o.id);
  const lines = new Map<string, FulfilmentLine[]>();
  if (ids.length > 0) {
    const rows = await db
      .select({
        orderId: orderItems.orderId,
        name: orderItems.name,
        quantity: orderItems.quantity,
        weightKg: orderItems.weightKg,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids))
      .orderBy(asc(orderItems.id));
    for (const r of rows) {
      const list = lines.get(r.orderId) ?? [];
      list.push({ name: r.name, quantity: r.quantity, weightKg: r.weightKg });
      lines.set(r.orderId, list);
    }
  }

  return {
    pickups,
    unscheduled,
    deliveries,
    shipments,
    lines,
    truncated: [unscheduled, deliveries, shipments].some((q) => q.length >= QUEUE_LIMIT),
  };
}
/**
 * The order a booking was converted into, if any.
 *
 * A reservation of type `order` ("mi tenga 2 kg di ciauscolo per giovedì") holds
 * a name, a phone, a date and notes — and no line items, no price, no VAT, no
 * stock movement and no loyalty. Converting it is what puts the sale on the
 * books; this is how the booking knows it has been, so the button becomes a link
 * instead of offering to do it twice.
 */
/**
 * The booking an order was converted from, if any.
 *
 * The forward link (booking → "Ordine 1042 →") has existed since the conversion
 * did; the way back did not, so an order created from a phone booking looked
 * like any counter sale and the notes the customer actually gave were one page
 * away with no route to it.
 */
export async function getReservationForOrder(reservationId: string | null) {
  if (!reservationId) return null;
  const [row] = await db
    .select({
      id: reservations.id,
      reference: reservations.reference,
      date: reservations.date,
      time: reservations.time,
      type: reservations.type,
      // The caparra travels with the booking so the order can say how much is
      // genuinely left to collect — it is part payment against this sale, and
      // the counter was being told to take the full amount a second time.
      depositCents: reservations.depositCents,
      depositPaidAt: reservations.depositPaidAt,
    })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  return row ?? null;
}

export async function getOrderForReservation(reservationId: string) {
  const [row] = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, totalCents: orders.totalCents })
    .from(orders)
    .where(eq(orders.reservationId, reservationId))
    .limit(1);
  return row ?? null;
}

// ── Global search (⌘K) ───────────────────────────────────────────────────────

export type QuickHit = {
  kind: "order" | "reservation" | "customer" | "product" | "discount";
  id: string;
  href: string;
  /** The line the operator scans for — an order number, a person's name. */
  title: string;
  /** Everything else worth seeing without opening the record. */
  subtitle: string;
};

/**
 * One search across the four things an operator arrives looking for.
 *
 * The ⌘K palette was a static list of forty links: it could take you to the
 * orders *page* but not to an order, which is the opposite of what someone
 * typing a customer's name on the phone wants. Everything needed was already
 * here — trigram FTS indexes over orders, reservations and users since
 * migration 0024 — so this is the query that was missing, not the machinery.
 *
 * Deliberately shallow: four or five hits per kind. It is a jump-to, not a
 * report; the list pages do filtering, sorting and pagination, and each group
 * links to them for the full set.
 */
export async function quickSearch(rawTerm: string, opts: { scope?: string | null } = {}) {
  const q = rawTerm.trim();
  if (q.length < 2) return [] as QuickHit[];
  const PER_KIND = 5;
  // A shop-scoped operator searches their own location, exactly as their lists
  // are locked — otherwise the palette would be the way around the scope.
  const scope = opts.scope ?? null;

  const [orderRows, reservationRows, customerRows, productRows, discountRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        name: orders.name,
        totalCents: orders.totalCents,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(and(ordersWhere({ q }), scope ? eq(orders.shopSlug, scope) : undefined))
      .orderBy(desc(orders.createdAt))
      .limit(PER_KIND),
    db
      .select({
        id: reservations.id,
        reference: reservations.reference,
        name: reservations.name,
        date: reservations.date,
        time: reservations.time,
        type: reservations.type,
        status: reservations.status,
      })
      .from(reservations)
      .where(and(reservationsWhere({ q }), scope ? eq(reservations.shopSlug, scope) : undefined))
      .orderBy(desc(reservations.date))
      .limit(PER_KIND),
    db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        phone: users.phone,
        points: loyaltyAccounts.points,
      })
      .from(users)
      .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id))
      // `customersWhere` already OR-s in the loyalty card number, which the
      // users index cannot cover because it lives on the joined table.
      .where(customersWhere({ q, ruolo: "all" }))
      .orderBy(desc(users.createdAt))
      .limit(PER_KIND),
    db
      .select({
        id: products.id,
        name: products.name,
        category: products.category,
        stock: products.stock,
        priceCents: products.priceCents,
      })
      .from(products)
      // Archived products stay searchable: "where did that product go" is one
      // of the reasons to search for it.
      .where(and(productsWhere({ q }, 5), scope ? eq(products.shopSlug, scope) : undefined))
      .orderBy(asc(products.name))
      .limit(PER_KIND),
    // Not shop-scoped: a coupon belongs to the business, like a customer.
    db
      .select({
        id: discountCodes.id,
        code: discountCodes.code,
        type: discountCodes.type,
        value: discountCodes.value,
        active: discountCodes.active,
        timesUsed: discountCodes.timesUsed,
        maxRedemptions: discountCodes.maxRedemptions,
      })
      .from(discountCodes)
      .where(discountsWhere({ q }))
      .orderBy(desc(discountCodes.createdAt))
      .limit(PER_KIND),
  ]);

  const eur = (c: number | null) => (c == null ? "" : `${(c / 100).toFixed(2)} €`);

  return [
    ...orderRows.map<QuickHit>((o) => ({
      kind: "order",
      id: o.id,
      href: `/admin/orders/${o.id}`,
      title: `#${o.orderNumber} · ${o.name}`,
      subtitle: [eur(o.totalCents), o.status, o.createdAt ? dateInRome(o.createdAt) : ""]
        .filter(Boolean)
        .join(" · "),
    })),
    ...reservationRows.map<QuickHit>((r) => ({
      kind: "reservation",
      id: r.id,
      href: `/admin/reservations/${r.id}`,
      title: `${r.name} · ${r.reference}`,
      subtitle: [r.date, r.time, r.type, r.status].filter(Boolean).join(" · "),
    })),
    ...customerRows.map<QuickHit>((c) => ({
      kind: "customer",
      id: c.id,
      href: `/admin/loyalty/${c.id}`,
      title: c.name || c.username,
      subtitle: [c.email, c.phone, c.points != null ? `${c.points} punti` : ""]
        .filter(Boolean)
        .join(" · "),
    })),
    ...productRows.map<QuickHit>((p) => ({
      kind: "product",
      id: p.id,
      href: `/admin/products/${p.id}`,
      title: p.name,
      subtitle: [p.category, eur(p.priceCents), p.stock != null ? `${p.stock} in giacenza` : ""]
        .filter(Boolean)
        .join(" · "),
    })),
    // Coupons are the one thing an operator searches for by an exact string
    // they were told over the phone ("il codice è NATALE20"), and the palette —
    // the search box built for exactly that — had no idea they existed.
    ...discountRows.map<QuickHit>((d) => ({
      kind: "discount",
      id: d.id,
      href: `/admin/discounts/${d.id}`,
      title: d.code,
      subtitle: [
        d.type === "percent" ? `${d.value}%` : d.type === "fixed" ? eur(d.value) : "spedizione gratis",
        d.active ? "attivo" : "disattivato",
        `usato ${d.timesUsed}${d.maxRedemptions != null ? `/${d.maxRedemptions}` : ""}`,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  ];
}

// ── Shops ────────────────────────────────────────────────────────────────────

/**
 * Rows that still point at a sede, by table. `deleteShop` refuses while any is
 * non-zero and names them; the FOREIGN KEY error alone cannot say which.
 */
export async function adminShopReferences(slug: string): Promise<{
  products: number;
  orders: number;
  reservations: number;
  users: number;
}> {
  const count = (n: number | null | undefined) => Number(n ?? 0);
  const [p, o, r, u] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(products).where(eq(products.shopSlug, slug)),
    db.select({ n: sql<number>`count(*)` }).from(orders).where(eq(orders.shopSlug, slug)),
    db.select({ n: sql<number>`count(*)` }).from(reservations).where(eq(reservations.shopSlug, slug)),
    db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.shopSlug, slug)),
  ]);
  return {
    products: count(p[0]?.n),
    orders: count(o[0]?.n),
    reservations: count(r[0]?.n),
    users: count(u[0]?.n),
  };
}

/** Closures not yet over, soonest first — the plain rows, no booking counts. */
export function adminUpcomingClosures(today: string = dateInRome()) {
  return db
    .select()
    .from(shopClosures)
    .where(gte(shopClosures.toDate, today))
    .orderBy(asc(shopClosures.fromDate), asc(shopClosures.shopSlug));
}

// ── Sales & margin analysis ──────────────────────────────────────────────────

/**
 * Every merchandise line settled in a window, with the order context the margin
 * arithmetic needs and the product's current cost.
 *
 * Rows rather than a `group by`, because the aggregation has to split VAT out of
 * each line and allocate each order's discount across its own lines — neither of
 * which SQLite can do without repeating `splitGross` in SQL, where it would
 * silently drift from `lib/fiscal.ts`. The volume is bounded by the period: a
 * month of this shop is a few hundred rows.
 *
 * `left join` on products deliberately: a line whose product was deleted still
 * sold, so it keeps its revenue and lands in the uncosted bucket rather than
 * vanishing from the period's takings.
 */
export async function getSalesLines(
  from: Date,
  to: Date,
  shopSlug: string | undefined,
  scope: string | null = null,
): Promise<{ lines: SaleLine[]; orders: OrderContext[] }> {
  const where = and(
    everSettled,
    sql`${settledAt} >= ${from.getTime()}`,
    sql`${settledAt} < ${to.getTime()}`,
    shopSlug && shopSlug !== "all" ? eq(orders.shopSlug, shopSlug) : undefined,
    inShop(orders.shopSlug, scope),
  );

  const [rows, orderRows] = await Promise.all([
    db
      .select({
        orderId: orderItems.orderId,
        shopSlug: orders.shopSlug,
        productId: orderItems.productId,
        name: orderItems.name,
        category: products.category,
        vatRateBps: orderItems.vatRateBps,
        lineTotalCents: orderItems.lineTotalCents,
        quantity: orderItems.quantity,
        weightKg: orderItems.weightKg,
        unitCostCents: products.costCents,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(where),
    db
      .select({
        id: orders.id,
        subtotalCents: orders.subtotalCents,
        discountCents: orders.discountCents,
      })
      .from(orders)
      .where(where),
  ]);

  return {
    lines: rows.map((r) => ({
      orderId: r.orderId,
      shopSlug: r.shopSlug,
      productId: r.productId,
      productName: r.name,
      category: r.category ?? "",
      vatRateBps: r.vatRateBps,
      lineTotalCents: r.lineTotalCents,
      quantity: r.quantity,
      weightKg: r.weightKg,
      unitCostCents: r.unitCostCents,
    })),
    orders: orderRows,
  };
}

/**
 * The analysis for a window, plus the same analysis over the window immediately
 * before it — which is what turns "€5.218" into "€5.218, up 55%".
 *
 * The comparison period is the same *length* ending where this one starts, not
 * "last month": comparing a 9-day range against a 31-day one is the classic way
 * a dashboard reports a collapse that never happened.
 */
export async function getSalesAnalysis(
  from: Date,
  to: Date,
  shopSlug: string | undefined,
  scope: string | null = null,
  shopLabel?: (slug: string | null) => string,
): Promise<{ current: SalesAnalysis; previous: SalesAnalysis }> {
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);
  const [cur, prev] = await Promise.all([
    getSalesLines(from, to, shopSlug, scope),
    getSalesLines(prevFrom, from, shopSlug, scope),
  ]);
  return {
    current: analyseSales(cur.lines, cur.orders, { shopLabel }),
    previous: analyseSales(prev.lines, prev.orders, { shopLabel }),
  };
}

/**
 * Staff accounts with no sede assigned.
 *
 * `inShop(col, null)` adds no predicate, so a staff row with a null `shopSlug`
 * sees the whole business — every scope guard in the app is a no-op for them.
 * That is the correct behaviour for an owner who works both counters, and it is
 * also what an account nobody got round to assigning looks like. The two are
 * indistinguishable from the outside, which is why the state was invisible: the
 * separation was built, tested, and switched on for nobody.
 */
export async function countUnscopedStaff(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "staff"), isNull(users.shopSlug), eq(users.active, true)));
  return r?.n ?? 0;
}
