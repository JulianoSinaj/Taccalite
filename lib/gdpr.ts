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
  addresses,
  stockNotifications,
  discountRedemptions,
  authTokens,
} from "@/lib/db/schema";
import { deleteUserSessions } from "@/lib/auth/session";

/**
 * Gather everything the platform holds about one user, for a GDPR right-of-access
 * (art. 15) export. Returns a plain object serialisable to JSON.
 */
export async function gatherUserData(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const email = user.email?.toLowerCase() ?? null;
  const [
    account,
    txns,
    userOrders,
    userReservations,
    userRedemptions,
    subscriber,
    savedAddresses,
    stockWaitlist,
    couponUses,
  ] = await Promise.all([
    db.select().from(loyaltyAccounts).where(eq(loyaltyAccounts.userId, userId)),
    db.select().from(loyaltyTransactions).where(eq(loyaltyTransactions.userId, userId)),
    db.select().from(orders).where(eq(orders.userId, userId)),
    db.select().from(reservations).where(eq(reservations.userId, userId)),
    db.select().from(redemptions).where(eq(redemptions.userId, userId)),
    email
      ? db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email))
      : Promise.resolve([]),
    // The saved address book. Plainly personal data, plainly the customer's,
    // and it was the one table the export walked straight past.
    db.select().from(addresses).where(eq(addresses.userId, userId)),
    // Both of these hold the address rather than the account id, so they are
    // only reachable by email — which is exactly why they were missed.
    email
      ? db.select().from(stockNotifications).where(eq(stockNotifications.email, email))
      : Promise.resolve([]),
    email
      ? db.select().from(discountRedemptions).where(eq(discountRedemptions.email, email))
      : Promise.resolve([]),
  ]);

  const orderIds = userOrders.map((o) => o.id);
  const items = orderIds.length
    ? (await Promise.all(orderIds.map((oid) => db.select().from(orderItems).where(eq(orderItems.orderId, oid))))).flat()
    : [];

  // Credentials are not personal data, and an export is not a safe place for
  // them. Only the password hash used to be stripped — so the file carried the
  // TOTP **secret** and the recovery codes, which is to say a working second
  // factor. That file is downloaded, emailed, dropped in a cloud folder; anyone
  // who ends up with it could generate the customer's codes indefinitely, and
  // the customer would have no way of knowing.
  const {
    passwordHash: _pw,
    totpSecret: _totp,
    totpRecoveryCodes: _codes,
    ...safeUser
  } = user;
  void _pw;
  void _totp;
  void _codes;

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
    addresses: savedAddresses,
    stockNotifications: stockWaitlist,
    discountRedemptions: couponUses,
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
      .set({ status: "unsubscribed", unsubscribedAt: new Date() })
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
      // The second factor goes with the account it protected. Leaving the
      // secret behind kept a live credential attached to a row that is meant to
      // hold nothing identifying, and the recovery codes with it.
      totpEnabled: false,
      totpSecret: null,
      totpRecoveryCodes: null,
    })
    .where(eq(users.id, userId));

  // The address book is deleted outright rather than scrubbed: unlike an order,
  // a saved delivery address carries no fiscal-retention obligation, so there
  // is nothing to weigh against erasing it. It was surviving erasure entirely.
  await db.delete(addresses).where(eq(addresses.userId, userId));

  // Any outstanding reset or verification link would otherwise still redeem
  // against the erased account.
  await db.delete(authTokens).where(eq(authTokens.userId, userId));

  // Back-in-stock requests are keyed by address, so they outlived the account
  // and would have emailed a customer who had asked to be forgotten.
  if (user.email) {
    await db.delete(stockNotifications).where(eq(stockNotifications.email, user.email.toLowerCase()));
  }

  // Scrub PII on the user's reservations (kept for operational history, de-identified).
  await db
    .update(reservations)
    .set({ name: "Cliente rimosso", phone: "—", email: null, notes: null })
    .where(eq(reservations.userId, userId));

  // Retire the loyalty card and zero the balance.
  //
  // Without this the erased customer's card number stayed valid: it is unique
  // and scannable, so the in-shop screen would go on crediting points to an
  // account nobody can see or spend from. The card number itself is also a
  // quasi-identifier the customer was given, so it is replaced rather than kept.
  // The transaction history is reduced to its shape — deltas and balances are
  // business records, but their free-text reasons can name orders and rewards.
  await db
    .update(loyaltyAccounts)
    .set({ points: 0, cardNumber: `deleted-${nanoid(10)}` })
    .where(eq(loyaltyAccounts.userId, userId));
  await db
    .update(loyaltyTransactions)
    .set({ reason: "Dati rimossi" })
    .where(eq(loyaltyTransactions.userId, userId));

  await deleteUserSessions(userId);
  return true;
}
