import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  reservations,
  orders,
  products,
  blogPosts,
  shops,
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

export const getReservations = (status?: string) =>
  status && status !== "all"
    ? db.select().from(reservations).where(eq(reservations.status, status as "pending")).orderBy(desc(reservations.createdAt))
    : db.select().from(reservations).orderBy(desc(reservations.createdAt));

export const getOrdersList = () => db.select().from(orders).orderBy(desc(orders.createdAt));

export const adminGetProducts = () => db.select().from(products).orderBy(products.sortOrder);
export const adminGetProduct = (id: string) =>
  db.select().from(products).where(eq(products.id, id)).limit(1).then((r) => r[0] ?? null);

export const adminGetBlogPosts = () => db.select().from(blogPosts).orderBy(desc(blogPosts.date));
export const adminGetBlogPost = (id: string) =>
  db.select().from(blogPosts).where(eq(blogPosts.id, id)).limit(1).then((r) => r[0] ?? null);

export const adminGetShops = () => db.select().from(shops).orderBy(shops.sortOrder);
export const adminGetShop = (id: string) =>
  db.select().from(shops).where(eq(shops.id, id)).limit(1).then((r) => r[0] ?? null);

export async function getCustomersWithPoints() {
  return db
    .select({
      id: users.id,
      name: users.name,
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

export const getRedemptions = () =>
  db.select().from(redemptions).orderBy(desc(redemptions.createdAt));

export const getRecentLoyaltyTx = (userId: string) =>
  db
    .select()
    .from(loyaltyTransactions)
    .where(eq(loyaltyTransactions.userId, userId))
    .orderBy(desc(loyaltyTransactions.createdAt))
    .limit(50);

export const getSubscribers = () =>
  db.select().from(newsletterSubscribers).orderBy(desc(newsletterSubscribers.createdAt));

export const getOutbox = () => db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(200);

export const getAllSettings = () => db.select().from(settings).orderBy(settings.key);
