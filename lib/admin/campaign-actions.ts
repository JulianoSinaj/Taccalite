"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterCampaigns, customerSegments } from "@/lib/db/schema";
import { countSegment, describeRule } from "@/lib/segments";
import { requireRole } from "@/lib/auth/session";
import { sendMail } from "@/lib/mail/mailer";
import { newsletterBroadcast } from "@/lib/mail/templates";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { campaignBodyHtml, deliverCampaign, getCampaign } from "@/lib/newsletter-campaigns";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm } from "@/lib/validation/admin";

/**
 * Newsletter campaigns and audiences — full admins only.
 *
 * These used to run under `requireAdmin()`, which admits staff, while the
 * subscriber CSV on the same page was `requireRole("admin")`. So downloading the
 * mailing list was a full-admin act and writing to all of it in the shop's name
 * was not. Sending is the less reversible of the two.
 */

const campaignInput = z.object({
  id: z.string().trim().max(40).optional(),
  subject: z.string().trim().min(1, "L'oggetto è obbligatorio").max(300),
  body: z.string().trim().min(1, "Il messaggio è obbligatorio").max(20000),
  /** Subscriber source to target; blank = every confirmed subscriber. */
  segment: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** A named segment, which wins over `segment` when set. */
  segmentId: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** `datetime-local` value; blank = not scheduled. */
  scheduledFor: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

/** Load a campaign that is still editable, or explain why it isn't. */
async function mustBeEditable(id: string) {
  const campaign = await getCampaign(id);
  if (!campaign) throw new ActionError("Campagna non trovata.");
  if (campaign.status === "sent") {
    throw new ActionError("Questa campagna è già stata inviata. Duplicala per rimandarla.");
  }
  return campaign;
}

/** Create or update a draft. Never sends. */
export async function saveCampaign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(campaignInput, fd);
    if (d.id) await mustBeEditable(d.id);

    const scheduledFor = d.scheduledFor ? new Date(d.scheduledFor) : null;
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
      throw new ActionError("Data di programmazione non valida.");
    }

    const values = {
      subject: d.subject,
      body: d.body,
      segment: d.segment ?? null,
      segmentId: d.segmentId ?? null,
      // Having a date is what makes it scheduled; clearing it returns it to draft.
      status: (scheduledFor ? "scheduled" : "draft") as "scheduled" | "draft",
      scheduledFor,
      error: null,
      updatedAt: new Date(),
    };

    let campaignId = d.id;
    if (d.id) {
      await db.update(newsletterCampaigns).set(values).where(eq(newsletterCampaigns.id, d.id));
    } else {
      const [created] = await db
        .insert(newsletterCampaigns)
        .values({ ...values, createdByUserId: actor.id })
        .returning({ id: newsletterCampaigns.id });
      campaignId = created?.id;
    }

    // Scheduling is the interesting half: a campaign set to go out on Friday
    // will send itself with nobody at the keyboard, so the decision is logged
    // now rather than only when the cron fires.
    await logAudit({
      actor,
      action: scheduledFor ? "campaign.schedule" : "campaign.draft",
      entity: "campaign",
      entityId: campaignId,
      summary: scheduledFor
        ? `Newsletter "${d.subject}" programmata per il ${scheduledFor.toLocaleString("it-IT")}`
        : `Bozza newsletter "${d.subject}" salvata`,
      meta: { segment: d.segment ?? null, scheduledFor: scheduledFor?.toISOString() ?? null },
    });

    revalidatePath("/admin/newsletter");
    return ok(
      scheduledFor
        ? `Campagna programmata per il ${scheduledFor.toLocaleString("it-IT")}.`
        : "Bozza salvata.",
    );
  });
}

/** Send a campaign right now. */
export async function sendCampaignNow(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    const campaign = await mustBeEditable(id);

    const { sent, queued } = await deliverCampaign(id);
    if (!sent) return ok("Campagna già inviata.");

    await logAudit({
      actor,
      action: "campaign.send",
      entity: "campaign",
      entityId: id,
      summary: `Newsletter "${campaign.subject}" inviata a ${queued} iscritti${
        campaign.segment ? ` (segmento ${campaign.segment})` : ""
      }`,
      meta: { queued, segment: campaign.segment },
    });

    revalidatePath("/admin/newsletter");
    revalidatePath("/admin/outbox");
    return ok(`Newsletter accodata per ${queued} iscritti.`);
  });
}

/** Email the composed campaign to the owner alone, before the real send. */
export async function sendCampaignTest(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    const campaign = await getCampaign(id);
    if (!campaign) throw new ActionError("Campagna non trovata.");

    await sendMail({
      to: env.ownerEmail,
      ...newsletterBroadcast(`[PROVA] ${campaign.subject}`, campaignBodyHtml(campaign.body), "#"),
    });

    revalidatePath("/admin/outbox");
    return ok(`Email di prova inviata a ${env.ownerEmail}.`);
  });
}

/** Copy a campaign back into a fresh draft — the way to resend a sent one. */
export async function duplicateCampaign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const campaign = await getCampaign(String(fd.get("id") ?? "").trim());
    if (!campaign) throw new ActionError("Campagna non trovata.");

    await db.insert(newsletterCampaigns).values({
      subject: campaign.subject,
      body: campaign.body,
      segment: campaign.segment,
      status: "draft",
      createdByUserId: actor.id,
    });

    revalidatePath("/admin/newsletter");
    return ok("Bozza creata da questa campagna.");
  });
}

// ── Reusable segments ────────────────────────────────────────────────────────
/** Blank → null; otherwise a non-negative integer. */
const optionalCount = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : NaN;
  })
  .refine((v) => v == null || Number.isInteger(v), "Valore non valido");

const segmentInput = z.object({
  id: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1, "Dai un nome al segmento").max(120),
  description: z.string().trim().max(300).optional().transform((v) => v ?? ""),
  source: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
  shopSlug: z.string().trim().max(80).optional().transform((v) => (v ? v : null)),
  minPoints: optionalCount,
  minOrders: optionalCount,
  minSpendEuros: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v != null && v !== "" ? Math.round(Number(String(v).replace(",", ".")) * 100) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Spesa minima non valida"),
  inactiveDays: optionalCount,
  requireMarketingConsent: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
});

/** Create or update a named segment. */
export async function saveSegment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(segmentInput, fd);

    const rule = {
      source: d.source,
      shopSlug: d.shopSlug,
      minPoints: d.minPoints,
      minOrders: d.minOrders,
      minSpendCents: d.minSpendEuros,
      inactiveDays: d.inactiveDays,
      requireMarketingConsent: d.requireMarketingConsent || null,
    };
    const values = { name: d.name, description: d.description, rule, updatedAt: new Date() };

    let segmentId = d.id;
    if (d.id) {
      await db.update(customerSegments).set(values).where(eq(customerSegments.id, d.id));
    } else {
      const [created] = await db
        .insert(customerSegments)
        .values({ ...values, createdByUserId: actor.id })
        .returning({ id: customerSegments.id });
      segmentId = created?.id;
    }

    const size = await countSegment(rule);
    await logAudit({
      actor,
      action: d.id ? "segment.update" : "segment.create",
      entity: "segment",
      entityId: segmentId,
      summary: `Segmento «${d.name}»: ${describeRule(rule)} — ${size} iscritti`,
      meta: { rule, size },
    });

    revalidatePath("/admin/newsletter");
    return ok(`Segmento salvato: ${size} iscritti corrispondono in questo momento.`);
  });
}

export async function deleteSegment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    const [row] = await db
      .select({ name: customerSegments.name })
      .from(customerSegments)
      .where(eq(customerSegments.id, id))
      .limit(1);
    if (!row) throw new ActionError("Segmento non trovato.");

    await db.delete(customerSegments).where(eq(customerSegments.id, id));
    // Campaigns that used it fall back to "tutti gli iscritti" rather than
    // silently targeting nobody.
    await db
      .update(newsletterCampaigns)
      .set({ segmentId: null })
      .where(eq(newsletterCampaigns.segmentId, id));

    await logAudit({
      actor,
      action: "segment.delete",
      entity: "segment",
      entityId: id,
      summary: `Segmento «${row.name}» eliminato`,
    });
    revalidatePath("/admin/newsletter");
    return ok("Segmento eliminato.");
  });
}

/** Delete a draft or scheduled campaign. A sent one is history and stays. */
export async function deleteCampaign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    const campaign = await mustBeEditable(id);
    await db.delete(newsletterCampaigns).where(eq(newsletterCampaigns.id, id));
    await logAudit({
      actor,
      action: "campaign.delete",
      entity: "campaign",
      entityId: id,
      summary: `Campagna eliminata: "${campaign.subject}"${
        campaign.status === "scheduled" ? " (era programmata)" : ""
      }`,
    });
    revalidatePath("/admin/newsletter");
    return ok("Campagna eliminata.");
  });
}
