import "server-only";
import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
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
  auditLog,
} from "@/lib/db/schema";
import { deleteExpiredSessions } from "@/lib/auth/session";
import { sendMail, enqueueMail, drainOutbox } from "@/lib/mail/mailer";
import { porchettaReminderEmail, newsletterBroadcast, ownerDigestEmail } from "@/lib/mail/templates";
import { getSetting, setSetting } from "@/lib/db/queries";
import { env } from "@/lib/env";
import { addPoints } from "@/lib/loyalty";
import { absoluteUrl } from "@/lib/site";
import { dateInRome } from "@/lib/time";
import { verifySearchIndexes } from "@/lib/admin/search";
import { sweepOrphanedMedia } from "@/lib/media";

// ── Job registry ─────────────────────────────────────────────────────────────
/**
 * The scheduled jobs, in one place, so the cron endpoint, the Settings panel and
 * the "run now" action all agree on what exists and what each one is called.
 *
 * Every run is stamped into `cron.lastRun.<key>` so the operator can see whether
 * the scheduler is actually alive — previously these ran completely blind, with
 * `digest.lastSentDate` as the only indirect trace.
 */
export type CronJobKey =
  | "porchetta-reminders"
  | "maintenance"
  | "points-expiry"
  | "owner-digest"
  | "pickup-autofulfil"
  | "campaigns";

export type CronJob = {
  key: CronJobKey;
  label: string;
  description: string;
  run: (now?: Date) => Promise<unknown>;
};

export type CronRunRecord = { at: string; ok: boolean; result?: unknown; error?: string };

const lastRunKey = (key: CronJobKey) => `cron.lastRun.${key}`;

/** Run one job and record the outcome. Never throws: a failure is recorded too. */
export async function runCronJob(job: CronJob, now = new Date()): Promise<CronRunRecord> {
  let record: CronRunRecord;
  try {
    record = { at: now.toISOString(), ok: true, result: await job.run(now) };
  } catch (err) {
    console.error(`[cron] job ${job.key} failed:`, err);
    record = {
      at: now.toISOString(),
      ok: false,
      error: err instanceof Error ? err.message : "Errore sconosciuto",
    };
  }
  await setSetting(lastRunKey(job.key), record);
  return record;
}

/** Last recorded run per job (null when a job has never run). */
export async function getCronStatus(): Promise<Record<CronJobKey, CronRunRecord | null>> {
  const entries = await Promise.all(
    CRON_JOBS.map(async (j) => [j.key, await getSetting<CronRunRecord | null>(lastRunKey(j.key), null)] as const),
  );
  return Object.fromEntries(entries) as Record<CronJobKey, CronRunRecord | null>;
}

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
  const iso = dateInRome(today);
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
 * Send an admin-composed broadcast to confirmed subscribers.
 *
 * By default every confirmed subscriber is targeted; pass `opts.source` to
 * segment the send to only those confirmed subscribers whose `source` matches
 * (e.g. a single signup origin).
 *
 * Every message is enqueued to the outbox (fast, no blocking), then a throttled
 * first batch is sent inline; the cron `drainOutbox` sweep delivers any
 * remainder without firing hundreds of parallel SMTP calls (which a provider
 * would rate-limit or block).
 */
export async function broadcastToSubscribers(
  subject: string,
  bodyHtml: string,
  opts: { source?: string; segmentId?: string | null; campaignId?: string | null } = {},
): Promise<{ queued: number; sent: number }> {
  // A named segment resolves its rule now, against the current customer base;
  // otherwise fall back to the legacy "one signup source" targeting.
  let recipients: { email: string; token: string }[];
  if (opts.segmentId) {
    const { getSegment, resolveSegment } = await import("@/lib/segments");
    const segment = await getSegment(opts.segmentId);
    recipients = segment ? await resolveSegment(segment.rule) : [];
  } else {
    const conds = [eq(newsletterSubscribers.status, "confirmed")];
    if (opts.source) conds.push(eq(newsletterSubscribers.source, opts.source));
    recipients = await db
      .select({ email: newsletterSubscribers.email, token: newsletterSubscribers.token })
      .from(newsletterSubscribers)
      .where(and(...conds));
  }

  for (const s of recipients) {
    const unsubUrl = absoluteUrl(`/api/newsletter/unsubscribe?token=${s.token}`);
    await enqueueMail(
      { to: s.email, ...newsletterBroadcast(subject, bodyHtml, unsubUrl) },
      // Tagging the outbox rows is what lets the campaign report its own
      // bounces instead of reporting "sent to 412" and hiding 80 failures.
      { campaignId: opts.campaignId },
    );
  }

  const { sent } = await drainOutbox({ max: 50 });
  return { queued: recipients.length, sent };
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
 * Close out pickup orders that were paid but never marked handed over.
 *
 * A counter pickup has no shipping event to trigger fulfilment, so paid orders
 * pile up in the "da evadere" queue forever unless someone taps them. After
 * `orders.autoFulfilPickupDays` days a paid pickup order is assumed collected
 * and moved to `fulfilled`.
 *
 * Opt-in: the setting defaults to 0 (disabled), because in a shop that does mark
 * them off, auto-closing would hide genuinely uncollected orders. No email is
 * sent — the customer already has their goods, and a "your order shipped"
 * message would be wrong.
 */
export async function runPickupAutoFulfil(
  now = new Date(),
): Promise<{ fulfilled: number; afterDays: number }> {
  const days = await getSetting<number>("orders.autoFulfilPickupDays", 0);
  if (!days || days <= 0) return { fulfilled: 0, afterDays: 0 };

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const stale = await db
    .update(orders)
    .set({ status: "fulfilled", updatedAt: now })
    .where(
      and(
        eq(orders.status, "paid"),
        eq(orders.paymentStatus, "paid"),
        eq(orders.fulfilment, "pickup"),
        lt(orders.updatedAt, cutoff),
      ),
    )
    .returning({ id: orders.id });

  return { fulfilled: stale.length, afterDays: days };
}

/**
 * Housekeeping sweep: delete expired sessions, retry the outbox, and prune old
 * sent outbox rows. Safe to run frequently from the cron endpoint.
 */
export async function runMaintenance(
  now = new Date(),
  outboxRetentionDays = 90,
): Promise<{
  sessionsDeleted: number;
  outboxDrained: number;
  outboxPruned: number;
  auditPruned: number;
  searchIndexesRebuilt: string[];
  mediaDeleted: number;
  mediaBytesFreed: number;
}> {
  const { deleted: sessionsDeleted } = await deleteExpiredSessions();
  const drain = await drainOutbox();
  const cutoff = new Date(now.getTime() - outboxRetentionDays * 24 * 60 * 60 * 1000);
  const pruned = await db
    .delete(emailOutbox)
    .where(and(eq(emailOutbox.status, "sent"), lt(emailOutbox.createdAt, cutoff)));

  // Audit retention. The log grew forever, unlike the outbox — and an audit
  // trail nobody prunes eventually becomes one nobody reads. Default 730 days
  // (two years) comfortably outlives the fiscal questions it answers; 0 keeps
  // everything, for a shop that would rather decide later.
  const auditDays = await getSetting<number>("audit.retentionDays", 730);
  let auditPruned = 0;
  if (auditDays > 0) {
    const auditCutoff = new Date(now.getTime() - auditDays * 24 * 60 * 60 * 1000);
    const res = await db.delete(auditLog).where(lt(auditLog.createdAt, auditCutoff));
    auditPruned = res.rowsAffected;
  }
  // Cheap self-heal for the FTS indexes — see lib/admin/search.ts.
  const { rebuilt } = await verifySearchIndexes();
  // Reclaim upload files no record points at any more (replaced product photos,
  // images of deleted posts…). See `sweepOrphanedMedia` for the age guard that
  // keeps this safe next to a live upload.
  const media = await sweepOrphanedMedia(now);
  return {
    sessionsDeleted,
    outboxDrained: drain.sent,
    outboxPruned: pruned.rowsAffected,
    auditPruned,
    searchIndexesRebuilt: rebuilt,
    mediaDeleted: media.deleted,
    mediaBytesFreed: media.bytesFreed,
  };
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
  const iso = dateInRome(now);

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

  // Low-stock: purchasable + active products at/under their own reorder point,
  // falling back to the shop-wide threshold where none is set.
  const threshold = await getSetting<number>("store.lowStockThreshold", 5);
  const lowStockRows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.purchasable, true),
        eq(products.active, true),
        isNotNull(products.stock),
        sql`${products.stock} <= coalesce(${products.reorderPoint}, ${threshold})`,
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

/**
 * The registry itself, declared last so it can reference the job functions above.
 * Order is the order the Settings panel lists them in.
 */
export const CRON_JOBS: CronJob[] = [
  {
    key: "porchetta-reminders",
    label: "Promemoria porchetta",
    description: "Avvisa via email chi ha prenotato la porchetta e non è ancora stato contattato.",
    run: (now) => runPorchettaReminders(now),
  },
  {
    key: "owner-digest",
    label: "Riepilogo giornaliero",
    description: "Invia al titolare prenotazioni di oggi, ordini delle ultime 24 h e scorte basse. Una volta al giorno.",
    run: (now) => runOwnerDigest(now),
  },
  {
    key: "campaigns",
    label: "Newsletter programmate",
    description: "Invia le campagne arrivate a scadenza.",
    // Imported lazily: lib/newsletter-campaigns imports this module for the
    // delivery helper, so a static import here would be circular.
    run: async (now) => (await import("@/lib/newsletter-campaigns")).runDueCampaigns(now),
  },
  {
    key: "pickup-autofulfil",
    label: "Chiusura ritiri",
    description: "Segna evasi gli ordini da ritiro pagati e mai chiusi. Disattivato finché non imposti i giorni.",
    run: (now) => runPickupAutoFulfil(now),
  },
  {
    key: "points-expiry",
    label: "Scadenza punti",
    description: "Azzera i punti degli account inattivi oltre la soglia. Disattivato se la scadenza è 0.",
    run: (now) => runPointsExpiry(now),
  },
  {
    key: "maintenance",
    label: "Manutenzione",
    description: "Elimina le sessioni scadute, ritenta le email in coda e ripulisce lo storico invii.",
    run: () => runMaintenance(),
  },
];
