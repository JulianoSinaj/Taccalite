import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations, newsletterSubscribers } from "@/lib/db/schema";
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

  let sent = 0;
  for (const r of rows) {
    if (!r.email) continue;
    await sendMail({ to: r.email, ...porchettaReminderEmail(r.name, r.date, r.quantityKg) }).catch(() => {});
    sent += 1;
  }
  return { sent };
}

/** Send an admin-composed broadcast to all confirmed subscribers. */
export async function broadcastToSubscribers(subject: string, bodyHtml: string): Promise<{ sent: number }> {
  const subs = await db
    .select()
    .from(newsletterSubscribers)
    .where(eq(newsletterSubscribers.status, "confirmed"));

  let sent = 0;
  for (const s of subs) {
    const unsubUrl = absoluteUrl(`/api/newsletter/unsubscribe?token=${s.token}`);
    await sendMail({ to: s.email, ...newsletterBroadcast(subject, bodyHtml, unsubUrl) }).catch(() => {});
    sent += 1;
  }
  return { sent };
}
