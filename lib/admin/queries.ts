import "server-only";
import { and, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";

export const PAGE_SIZE = 25;
import { db } from "@/lib/db/client";
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

  return {
    pendingReservations: pendingRes?.n ?? 0,
    totalReservations: totalRes?.n ?? 0,
    paidOrders: paidOrders?.n ?? 0,
    customers: customers?.n ?? 0,
    subscribers: subs?.n ?? 0,
    pendingRedemptions: pendingRedemptions?.n ?? 0,
  };
}

/** Paginated reservations list, preserving the status + shop filters. */
export async function getReservationsPage(opts: {
  status?: string;
  shopSlug?: string;
  type?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const conds: SQL[] = [];
  if (opts.status && opts.status !== "all") conds.push(eq(reservations.status, opts.status as "pending"));
  if (opts.shopSlug && opts.shopSlug !== "all") conds.push(eq(reservations.shopSlug, opts.shopSlug));
  if (opts.type && opts.type !== "all") conds.push(eq(reservations.type, opts.type as "table"));
  if (opts.from) conds.push(gte(reservations.date, opts.from));
  if (opts.to) conds.push(lte(reservations.date, opts.to));
  if (opts.q) {
    const term = `%${opts.q.toLowerCase()}%`;
    conds.push(
      or(
        like(sql`lower(${reservations.reference})`, term),
        like(sql`lower(${reservations.name})`, term),
        like(sql`lower(${reservations.phone})`, term),
        like(sql`lower(coalesce(${reservations.email}, ''))`, term),
      )!,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
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
  const today = new Date().toISOString().slice(0, 10);
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

/** Paginated + searchable orders list. Search matches order number / name / email. */
export async function getOrdersPage(opts: { shopSlug?: string; q?: string; status?: string; fulfilment?: string; page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const conds: SQL[] = [];
  if (opts.shopSlug && opts.shopSlug !== "all") conds.push(eq(orders.shopSlug, opts.shopSlug));
  if (opts.status && opts.status !== "all") {
    // Special work-queue value: paid but not yet fulfilled.
    if (opts.status === "to-fulfil") {
      conds.push(eq(orders.status, "paid"));
    } else {
      conds.push(eq(orders.status, opts.status as "paid"));
    }
  }
  if (opts.fulfilment && opts.fulfilment !== "all") conds.push(eq(orders.fulfilment, opts.fulfilment as "pickup"));
  if (opts.q) {
    const term = `%${opts.q.toLowerCase()}%`;
    conds.push(
      or(
        like(sql`lower(${orders.orderNumber})`, term),
        like(sql`lower(${orders.name})`, term),
        like(sql`lower(${orders.email})`, term),
      )!,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
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

/** Paginated + searchable customers list with points. Search matches name / username / card. */
export async function getCustomersPage(opts: { q?: string; page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  let where: SQL | undefined;
  if (opts.q) {
    const term = `%${opts.q.toLowerCase()}%`;
    where = or(
      like(sql`lower(${users.name})`, term),
      like(sql`lower(${users.username})`, term),
      like(sql`lower(coalesce(${loyaltyAccounts.cardNumber}, ''))`, term),
    );
  }
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

export const adminGetProducts = () => db.select().from(products).orderBy(products.sortOrder);
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

export async function getCustomersWithPoints() {
  return db
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
    .leftJoin(loyaltyAccounts, eq(loyaltyAccounts.userId, users.id))
    .orderBy(desc(users.createdAt));
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
export async function getSubscribersPage(opts: { page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const [rows, [{ total }], [{ confirmed }]] = await Promise.all([
    db
      .select()
      .from(newsletterSubscribers)
      .orderBy(desc(newsletterSubscribers.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)` }).from(newsletterSubscribers),
    db
      .select({ confirmed: sql<number>`count(*)` })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.status, "confirmed")),
  ]);
  return { rows, total, confirmed, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const getOutbox = () => db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(200);

export const getAllSettings = () => db.select().from(settings).orderBy(settings.key);
