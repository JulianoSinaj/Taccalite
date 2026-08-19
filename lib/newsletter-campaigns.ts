import "server-only";
import { and, asc, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterCampaigns, emailOutbox, type NewsletterCampaignRow } from "@/lib/db/schema";
import { broadcastToSubscribers } from "@/lib/automation";

/**
 * Newsletter campaigns: composing, sending and scheduling.
 *
 * The delivery itself still goes through `broadcastToSubscribers` (enqueue to
 * the outbox, throttled first batch, cron drains the rest); a campaign adds the
 * record around it — what was written, who it targeted, when it went and how it
 * turned out.
 */

/** Render the operator's plaintext into the broadcast body HTML: blank lines
 *  become paragraphs, single newlines become <br>. */
export function campaignBodyHtml(bodyText: string): string {
  return bodyText
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:15px;line-height:1.7;color:#41281b;margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const listCampaigns = (limit = 50) =>
  db.select().from(newsletterCampaigns).orderBy(desc(newsletterCampaigns.createdAt)).limit(limit);

export type CampaignDelivery = { sent: number; failed: number; queued: number };

/**
 * What actually happened to a sent campaign's mail.
 *
 * `recipientCount` records how many were enqueued, which is not the same as how
 * many arrived — a campaign could read "inviata a 412 iscritti" while 80 of them
 * bounced into the outbox, with nothing tying the two together.
 */
export async function campaignDelivery(ids: string[]): Promise<Map<string, CampaignDelivery>> {
  const out = new Map<string, CampaignDelivery>();
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      campaignId: emailOutbox.campaignId,
      status: emailOutbox.status,
      n: sql<number>`count(*)`,
    })
    .from(emailOutbox)
    .where(inArray(emailOutbox.campaignId, ids))
    .groupBy(emailOutbox.campaignId, emailOutbox.status);

  for (const r of rows) {
    if (!r.campaignId) continue;
    const cur = out.get(r.campaignId) ?? { sent: 0, failed: 0, queued: 0 };
    if (r.status === "sent") cur.sent += r.n;
    else if (r.status === "failed") cur.failed += r.n;
    else cur.queued += r.n;
    out.set(r.campaignId, cur);
  }
  return out;
}

export async function getCampaign(id: string): Promise<NewsletterCampaignRow | null> {
  const [row] = await db.select().from(newsletterCampaigns).where(eq(newsletterCampaigns.id, id)).limit(1);
  return row ?? null;
}

/**
 * Deliver a campaign and record the outcome. Idempotent by status: a campaign
 * that has already been sent is left alone, so a retried scheduler run (or a
 * double click) can't blast subscribers twice.
 */
export async function deliverCampaign(id: string): Promise<{ sent: boolean; queued: number }> {
  // Claim it: flip to `sent` only if it isn't already. Only the caller whose
  // UPDATE actually changed a row goes on to deliver, so a retried scheduler run
  // or a double-clicked button can't blast subscribers twice.
  const [claimed] = await db
    .update(newsletterCampaigns)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(newsletterCampaigns.id, id), ne(newsletterCampaigns.status, "sent")))
    .returning({ id: newsletterCampaigns.id })
;

  if (!claimed) return { sent: false, queued: 0 };

  const campaign = await getCampaign(id);
  if (!campaign) return { sent: false, queued: 0 };

  try {
    const { queued } = await broadcastToSubscribers(campaign.subject, campaignBodyHtml(campaign.body), {
      source: campaign.segment ?? undefined,
      segmentId: campaign.segmentId,
      campaignId: campaign.id,
    });
    await db
      .update(newsletterCampaigns)
      .set({ recipientCount: queued, error: null, updatedAt: new Date() })
      .where(eq(newsletterCampaigns.id, id));
    return { sent: true, queued };
  } catch (err) {
    await db
      .update(newsletterCampaigns)
      .set({
        status: "failed",
        sentAt: null,
        error: err instanceof Error ? err.message : "Invio non riuscito",
        updatedAt: new Date(),
      })
      .where(eq(newsletterCampaigns.id, id));
    throw err;
  }
}

/**
 * Send every scheduled campaign whose time has come. Driven by the cron sweep,
 * so a campaign scheduled for Friday 09:00 goes out on the first run after that.
 */
export async function runDueCampaigns(now = new Date()): Promise<{ sent: number; queued: number }> {
  const due = await db
    .select({ id: newsletterCampaigns.id })
    .from(newsletterCampaigns)
    .where(
      and(
        eq(newsletterCampaigns.status, "scheduled"),
        lte(newsletterCampaigns.scheduledFor, now),
      ),
    )
    .orderBy(asc(newsletterCampaigns.scheduledFor));

  let sent = 0;
  let queued = 0;
  for (const c of due) {
    try {
      const res = await deliverCampaign(c.id);
      if (res.sent) {
        sent += 1;
        queued += res.queued;
      }
    } catch {
      // deliverCampaign already recorded the failure on the row; keep going so
      // one bad campaign doesn't block the rest of the queue.
    }
  }
  return { sent, queued };
}
