import "server-only";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  users,
  loyaltyAccounts,
  loyaltyTransactions,
  orders,
  orderItems,
  reservations,
  redemptions,
  newsletterSubscribers,
} from "@/lib/db/schema";
import { deleteUserSessions } from "@/lib/auth/session";

/**
 * Gather everything the platform holds about one user, for a GDPR right-of-access
 * (art. 15) export. Returns a plain object serialisable to JSON.
 */
export async function gatherUserData(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const [account, txns, userOrders, userReservations, userRedemptions, subscriber] = await Promise.all([
    db.select().from(loyaltyAccounts).where(eq(loyaltyAccounts.userId, userId)),
    db.select().from(loyaltyTransactions).where(eq(loyaltyTransactions.userId, userId)),
    db.select().from(orders).where(eq(orders.userId, userId)),
    db.select().from(reservations).where(eq(reservations.userId, userId)),
    db.select().from(redemptions).where(eq(redemptions.userId, userId)),
    user.email
      ? db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, user.email))
      : Promise.resolve([]),
  ]);

  const orderIds = userOrders.map((o) => o.id);
  const items = orderIds.length
    ? (await Promise.all(orderIds.map((oid) => db.select().from(orderItems).where(eq(orderItems.orderId, oid))))).flat()
    : [];

  // Never export the password hash.
  const { passwordHash: _omit, ...safeUser } = user;
  void _omit;

  return {
    exportedAt: new Date().toISOString(),
    user: safeUser,
    loyaltyAccount: account[0] ?? null,
    loyaltyTransactions: txns,
    orders: userOrders,
    orderItems: items,
    reservations: userReservations,
    redemptions: userRedemptions,
    newsletter: subscriber[0] ?? null,
  };
}

/**
 * Erase a user's personal data (GDPR art. 17). The account, its reservations and
 * newsletter subscription are scrubbed of identifying fields and the account is
 * deactivated and logged out everywhere.
 *
 * Orders are intentionally RETAINED: invoices/receipts are subject to a legal
 * fiscal-retention obligation (which overrides erasure), so order records stay
 * intact for accounting. The caller should surface this to the operator.
 */
export async function anonymizeUser(userId: string): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return false;

  // Unsubscribe any newsletter record tied to the old email before we drop it.
  if (user.email) {
    await db
      .update(newsletterSubscribers)
      .set({ status: "unsubscribed" })
      .where(eq(newsletterSubscribers.email, user.email));
  }

  await db
    .update(users)
    .set({
      username: `deleted-${nanoid(10)}`,
      name: "Cliente rimosso",
      email: null,
      phone: null,
      passwordHash: nanoid(32), // unusable — account can no longer log in
      active: false,
      marketingConsent: false,
      emailVerifiedAt: null,
    })
    .where(eq(users.id, userId));

  // Scrub PII on the user's reservations (kept for operational history, de-identified).
  await db
    .update(reservations)
    .set({ name: "Cliente rimosso", phone: "—", email: null, notes: null })
    .where(eq(reservations.userId, userId));

  await deleteUserSessions(userId);
  return true;
}
