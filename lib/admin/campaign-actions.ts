"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newsletterCampaigns } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { sendMail } from "@/lib/mail/mailer";
import { newsletterBroadcast } from "@/lib/mail/templates";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { campaignBodyHtml, deliverCampaign, getCampaign } from "@/lib/newsletter-campaigns";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm } from "@/lib/validation/admin";

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
    const actor = await requireAdmin();
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
      // Having a date is what makes it scheduled; clearing it returns it to draft.
      status: (scheduledFor ? "scheduled" : "draft") as "scheduled" | "draft",
      scheduledFor,
      error: null,
      updatedAt: new Date(),
    };

    if (d.id) {
      await db.update(newsletterCampaigns).set(values).where(eq(newsletterCampaigns.id, d.id));
    } else {
      await db.insert(newsletterCampaigns).values({ ...values, createdByUserId: actor.id });
    }

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
    const actor = await requireAdmin();
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
    await requireAdmin();
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
    const actor = await requireAdmin();
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

/** Delete a draft or scheduled campaign. A sent one is history and stays. */
export async function deleteCampaign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    await mustBeEditable(id);
    await db.delete(newsletterCampaigns).where(eq(newsletterCampaigns.id, id));
    revalidatePath("/admin/newsletter");
    return ok("Campagna eliminata.");
  });
}
