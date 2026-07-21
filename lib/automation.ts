import "server-only";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations, newsletterSubscribers, emailOutbox, shops } from "@/lib/db/schema";
import { deleteExpiredSessions } from "@/lib/auth/session";
import { sendMail } from "@/lib/mail/mailer";
import { porchettaReminderEmail, newsletterBroadcast } from "@/lib/mail/templates";
import { absoluteUrl } from "@/lib/site";

/**
 * Send pickup reminders for upcoming porchetta reservations. Intended to run
 * (e.g. every Friday) from the /api/cron endpoint. Only reservations with an
 * email and a future date are notified.
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
      ),
    );

  const recipients = rows.filter((r) => r.email);
  // Resolve each reservation's pickup shop so the reminder names the right place.
  const shopSlugs = [...new Set(recipients.map((r) => r.shopSlug))];
  const shopRows = shopSlugs.length
    ? await db.select().from(shops).where(inArray(shops.slug, shopSlugs))
    : [];
  const shopBySlug = new Map(shopRows.map((s) => [s.slug, s]));

  await Promise.allSettled(
    recipients.map((r) => {
      const shop = shopBySlug.get(r.shopSlug);
      const pickup = shop ? { name: shop.name, address: shop.address } : null;
      return sendMail({
        to: r.email!,
        ...porchettaReminderEmail(r.name, r.date, r.quantityKg, pickup),
      });
    }),
  );
  return { sent: recipients.length };
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
