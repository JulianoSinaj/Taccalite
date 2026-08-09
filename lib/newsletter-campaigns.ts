import "server-only";
import { and, asc, desc, eq, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterCampaigns, type NewsletterCampaignRow } from "@/lib/db/schema";
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
  const [claimed] = db
    .update(newsletterCampaigns)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(newsletterCampaigns.id, id), ne(newsletterCampaigns.status, "sent")))
    .returning({ id: newsletterCampaigns.id })
    .all();

  if (!claimed) return { sent: false, queued: 0 };

  const campaign = await getCampaign(id);
  if (!campaign) return { sent: false, queued: 0 };

  try {
    const { queued } = await broadcastToSubscribers(
      campaign.subject,
      campaignBodyHtml(campaign.body),
      campaign.segment ? { source: campaign.segment } : {},
    );
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
