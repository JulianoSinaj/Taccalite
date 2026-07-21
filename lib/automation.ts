import "server-only";
import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  reservations,
  orders,
  products,
  newsletterSubscribers,
  emailOutbox,
  shops,
  loyaltyAccounts,
  loyaltyTransactions,
} from "@/lib/db/schema";
import { deleteExpiredSessions } from "@/lib/auth/session";
import { sendMail, enqueueMail, drainOutbox } from "@/lib/mail/mailer";
import { porchettaReminderEmail, newsletterBroadcast, ownerDigestEmail } from "@/lib/mail/templates";
import { getSetting, setSetting } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { addPoints } from "@/lib/loyalty";
import { absoluteUrl } from "@/lib/site";

/**
 * Send pickup reminders for upcoming porchetta reservations. Intended to run
 * (e.g. every Friday) from the /api/cron endpoint. Only reservations with an
 * email, a future date, and no reminder already sent are notified.
 *
 * Idempotent: each reservation is stamped with `remindedAt` once its reminder is
 * processed, and already-stamped rows are excluded — so repeat cron runs (or a
 * shared `job=all` endpoint hit more than once) never re-email the same customer.
 * A hard send failure leaves `remindedAt` NULL so it can be retried on a later run.
 */
export async function runPorchettaReminders(today = new Date()): Promise<{ sent: number }> {
  const iso = today.toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.type, "porchetta"),
        inArray(reservations.status, ["pending", "confirmed"]),
        gte(reservations.date, iso),
        isNull(reservations.remindedAt),
      ),
    );

  const recipients = rows.filter((r) => r.email);
  // Resolve each reservation's pickup shop so the reminder names the right place.
  const shopSlugs = [...new Set(recipients.map((r) => r.shopSlug))];
  const shopRows = shopSlugs.length
    ? await db.select().from(shops).where(inArray(shops.slug, shopSlugs))
    : [];
  const shopBySlug = new Map(shopRows.map((s) => [s.slug, s]));

  let sent = 0;
  await Promise.allSettled(
    recipients.map(async (r) => {
      const shop = shopBySlug.get(r.shopSlug);
      const pickup = shop ? { name: shop.name, address: shop.address } : null;
      const res = await sendMail({
        to: r.email!,
        ...porchettaReminderEmail(r.name, r.date, r.quantityKg, pickup),
      });
      // Stamp as reminded unless the send hard-failed (SMTP error) — a queued
      // outbox entry or a real delivery both count as "reminded"; a failure is
      // left NULL to retry next run.
      if (!res.error) {
        await db
          .update(reservations)
          .set({ remindedAt: new Date() })
          .where(eq(reservations.id, r.id));
        sent += 1;
      }
    }),
  );
  return { sent };
}

/**
 * Send an admin-composed broadcast to all confirmed subscribers.
 *
 * Every message is enqueued to the outbox (fast, no blocking), then a throttled
 * first batch is sent inline; the cron `drainOutbox` sweep delivers any
 * remainder without firing hundreds of parallel SMTP calls (which a provider
 * would rate-limit or block).
 */
export async function broadcastToSubscribers(
  subject: string,
  bodyHtml: string,
): Promise<{ queued: number; sent: number }> {
  const subs = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "confirmed"));

  for (const s of subs) {
    const unsubUrl = absoluteUrl(`/api/newsletter/unsubscribe?token=${s.token}`);
    await enqueueMail({ to: s.email, ...newsletterBroadcast(subject, bodyHtml, unsubUrl) });
  }

  const { sent } = await drainOutbox({ max: 50 });
  return { queued: subs.length, sent };
}

/**
 * Expire loyalty points for accounts inactive beyond `loyalty.pointsExpiryDays`
 * (a setting; 0 or absent = disabled — the default, so nothing expires unless the
 * owner opts in). The balance is zeroed through the ledger so it's auditable, and
 * the expiry entry itself counts as activity, so an account is never expired twice.
 */
export async function runPointsExpiry(
  now = new Date(),
): Promise<{ accountsExpired: number; pointsExpired: number }> {
  const days = await getSetting<number>("loyalty.pointsExpiryDays", 0);
  if (!days || days <= 0) return { accountsExpired: 0, pointsExpired: 0 };
  const cutoffMs = now.getTime() - days * 24 * 60 * 60 * 1000;

  // One grouped query for every account's balance + last activity, instead of a
  // per-account "max(createdAt)" round-trip (the previous N+1).
  const accounts = await db
    .select({
      userId: loyaltyAccounts.userId,
      points: loyaltyAccounts.points,
      lastActivity: sql<number | null>`max(${loyaltyTransactions.createdAt})`,
    })
    .from(loyaltyAccounts)
    .leftJoin(loyaltyTransactions, eq(loyaltyTransactions.userId, loyaltyAccounts.userId))
    .where(gt(loyaltyAccounts.points, 0))
    .groupBy(loyaltyAccounts.userId);

  let accountsExpired = 0;
  let pointsExpired = 0;
  for (const acc of accounts) {
    const latestMs = acc.lastActivity ?? 0;
    if (latestMs < cutoffMs) {
      await addPoints(acc.userId, -acc.points, "Punti scaduti per inattività");
      accountsExpired += 1;
      pointsExpired += acc.points;
    }
  }
  return { accountsExpired, pointsExpired };
}

/**
 * Housekeeping sweep: delete expired sessions, retry the outbox, and prune old
 * sent outbox rows. Safe to run frequently from the cron endpoint.
 */
export async function runMaintenance(
  now = new Date(),
  outboxRetentionDays = 90,
): Promise<{ sessionsDeleted: number; outboxDrained: number; outboxPruned: number }> {
  const { deleted: sessionsDeleted } = await deleteExpiredSessions();
  const drain = await drainOutbox();
  const cutoff = new Date(now.getTime() - outboxRetentionDays * 24 * 60 * 60 * 1000);
  const pruned = await db
    .delete(emailOutbox)
    .where(and(eq(emailOutbox.status, "sent"), lt(emailOutbox.createdAt, cutoff)));
  return { sessionsDeleted, outboxDrained: drain.sent, outboxPruned: pruned.changes ?? 0 };
}

/**
 * Email the owner a once-a-day operational digest: today's reservations, orders
 * from the last 24h, and products running low on stock.
 *
 * Idempotent per day: the run date is stamped into the `digest.lastSentDate`
 * setting ("YYYY-MM-DD") and an already-stamped day returns early WITHOUT
 * re-sending. That makes it safe to include in a frequent `job=all` sweep — it
 * self-limits to a single send per day. The marker is only written after a
 * successful (non hard-failing) send, so a transient SMTP error retries next run.
 */
export async function runOwnerDigest(
  now = new Date(),
): Promise<{
  skipped: boolean;
  date: string;
  reservations: number;
  orders: number;
  lowStock: number;
}> {
  const iso = now.toISOString().slice(0, 10);

  const lastSent = await getSetting<string>("digest.lastSentDate", "");
  if (lastSent === iso) {
    return { skipped: true, date: iso, reservations: 0, orders: 0, lowStock: 0 };
  }

  // Today's reservations (by ISO date), excluding cancelled ones.
  const todaysReservations = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.date, iso), ne(reservations.status, "cancelled")))
    .orderBy(reservations.time);

  // Orders placed in the last 24 hours.
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentOrders = await db
    .select()
    .from(orders)
    .where(gte(orders.createdAt, since))
    .orderBy(orders.createdAt);

  // Low-stock: purchasable + active products with a tracked stock at/under the threshold.
  const threshold = await getSetting<number>("store.lowStockThreshold", 5);
  const lowStockRows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.purchasable, true),
        eq(products.active, true),
        isNotNull(products.stock),
        lte(products.stock, threshold),
      ),
    )
    .orderBy(products.stock);

  const data = {
    date: iso,
    reservations: todaysReservations.map((r) => ({
      reference: r.reference,
      type: r.type,
      name: r.name,
      time: r.time,
      quantityKg: r.quantityKg,
    })),
    orders: recentOrders.map((o) => ({
      orderNumber: o.orderNumber,
      name: o.name,
      totalCents: o.totalCents,
    })),
    lowStock: lowStockRows.map((p) => ({ name: p.name, stock: p.stock ?? 0 })),
  };

  const res = await sendMail({ to: env.ownerEmail, ...ownerDigestEmail(data) });

  // Only mark the day done on a successful (or queued) send, so a hard SMTP
  // failure is retried on the next run rather than silently swallowed for a day.
  if (!res.error) {
    await setSetting("digest.lastSentDate", iso);
  }

  return {
    skipped: false,
    date: iso,
    reservations: data.reservations.length,
    orders: data.orders.length,
    lowStock: data.lowStock.length,
  };
}
