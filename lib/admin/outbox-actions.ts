"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailOutbox } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { drainOutbox } from "@/lib/mail/mailer";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";

/**
 * Re-queue a single outbox email and attempt an immediate delivery pass.
 * Resets the row to `queued`, zeroes its attempt counter and clears the last
 * error so the drain treats it as fresh.
 */
export async function retryOutboxEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Email non trovata.");

    const reset = await db
      .update(emailOutbox)
      .set({ status: "queued", attempts: 0, error: null })
      .where(eq(emailOutbox.id, id))
      .returning({ id: emailOutbox.id });
    if (reset.length === 0) throw new ActionError("Email non trovata.");

    await drainOutbox({ max: 5 });
    revalidatePath("/admin/outbox");
    return ok("Reinvio tentato.");
  });
}

/**
 * Re-queue every failed outbox email and drain the queue. Useful after fixing
 * SMTP configuration to flush a backlog in one click.
 */
export async function retryAllFailed(_prev: ActionState, _fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();

    const reset = await db
      .update(emailOutbox)
      .set({ status: "queued", attempts: 0, error: null })
      .where(eq(emailOutbox.status, "failed"))
      .returning({ id: emailOutbox.id });

    if (reset.length === 0) return ok("Nessuna email fallita da reinviare.");

    await drainOutbox();
    revalidatePath("/admin/outbox");
    return ok(
      reset.length === 1
        ? "1 email rimessa in coda e reinviata."
        : `${reset.length} email rimesse in coda e reinviate.`,
    );
  });
}
