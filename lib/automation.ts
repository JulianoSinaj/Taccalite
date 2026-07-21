import "server-only";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations, newsletterSubscribers, emailOutbox, shops } from "@/lib/db/schema";
import { deleteExpiredSessions } from "@/lib/auth/session";
import { sendMail } from "@/lib/mail/mailer";
import { porchettaReminderEmail, newsletterBroadcast } from "@/lib/mail/templates";
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

/** Send an admin-composed broadcast to all confirmed subscribers. */
export async function broadcastToSubscribers(subject: string, bodyHtml: string): Promise<{ sent: number }> {
  const subs = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "confirmed"));

  await Promise.allSettled(
    subs.map((s) => {
      const unsubUrl = absoluteUrl(`/api/newsletter/unsubscribe?token=${s.token}`);
      return sendMail({ to: s.email, ...newsletterBroadcast(subject, bodyHtml, unsubUrl) });
    }),
  );
  return { sent: subs.length };
}

/**
 * Housekeeping sweep: delete expired sessions and prune old outbox rows. Safe to
 * run frequently from the cron endpoint.
 */
export async function runMaintenance(
  now = new Date(),
  outboxRetentionDays = 90,
): Promise<{ sessionsDeleted: number; outboxPruned: number }> {
  const { deleted: sessionsDeleted } = await deleteExpiredSessions();
  const cutoff = new Date(now.getTime() - outboxRetentionDays * 24 * 60 * 60 * 1000);
  const pruned = await db
    .delete(emailOutbox)
    .where(and(eq(emailOutbox.status, "sent"), lt(emailOutbox.createdAt, cutoff)));
  return { sessionsDeleted, outboxPruned: pruned.changes ?? 0 };
}
