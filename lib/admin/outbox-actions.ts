"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailOutbox } from "@/lib/db/schema";
import { requireAdmin, requireRole } from "@/lib/auth/session";
import { drainOutbox, OUTBOX_MAX_ATTEMPTS } from "@/lib/mail/mailer";
import { smtpConfigured } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";

/**
 * Re-queue a single outbox email and attempt an immediate delivery pass.
 *
 * The attempt counter is deliberately NOT reset. `drainOutbox` stops retrying a
 * message once it has failed `OUTBOX_MAX_ATTEMPTS` times, and zeroing the count
 * defeated that cap entirely: a permanently invalid address could be retried
 * forever, one click at a time. An operator who has actually fixed something
 * (corrected SMTP settings, say) can still force a retry — that is what
 * `azzera` does — but it is now a deliberate, logged choice.
 */
export async function retryOutboxEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Email non trovata.");
    const resetAttempts = fd.get("azzera") === "true";

    const [row] = await db
      .select({
        toAddress: emailOutbox.toAddress,
        subject: emailOutbox.subject,
        attempts: emailOutbox.attempts,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.id, id))
      .limit(1);
    if (!row) throw new ActionError("Email non trovata.");

    if (!resetAttempts && row.attempts >= OUTBOX_MAX_ATTEMPTS) {
      throw new ActionError(
        `Questa email ha già fallito ${row.attempts} volte: l'indirizzo è probabilmente sbagliato. Usa «Forza reinvio» se hai risolto il problema.`,
      );
    }

    await db
      .update(emailOutbox)
      .set({ status: "queued", error: null, claimedAt: null, ...(resetAttempts ? { attempts: 0 } : {}) })
      .where(eq(emailOutbox.id, id));

    const { sent } = await drainOutbox({ max: 5 });

    if (resetAttempts) {
      await logAudit({
        actor,
        action: "outbox.retry_forced",
        entity: "email",
        entityId: id,
        summary: `Reinvio forzato (contatore azzerato) di "${row.subject}" → ${row.toAddress}`,
        meta: { previousAttempts: row.attempts },
      });
    }

    revalidatePath("/admin/outbox");
    if (!smtpConfigured) {
      // Saying "reinvio tentato" when no transport exists was simply untrue.
      return ok("SMTP non configurato: l'email è tornata in coda ma non è stata inviata.");
    }
    return sent > 0 ? ok("Email inviata.") : ok("Reinvio tentato: l'invio non è riuscito, controlla l'errore.");
  });
}

/**
 * Re-queue every failed outbox email still under the attempt cap and drain the
 * queue. Useful after fixing SMTP configuration to flush a backlog in one click.
 *
 * Messages that have exhausted their attempts are left alone and reported, so a
 * handful of dead addresses can't quietly consume every drain pass.
 */
export async function retryAllFailed(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const resetAttempts = fd.get("azzera") === "true";

    const [{ exhausted }] = await db
      .select({ exhausted: sql<number>`count(*)` })
      .from(emailOutbox)
      .where(sql`${emailOutbox.status} = 'failed' and ${emailOutbox.attempts} >= ${OUTBOX_MAX_ATTEMPTS}`);

    const reset = await db
      .update(emailOutbox)
      .set({ status: "queued", error: null, claimedAt: null, ...(resetAttempts ? { attempts: 0 } : {}) })
      .where(
        resetAttempts
          ? eq(emailOutbox.status, "failed")
          : sql`${emailOutbox.status} = 'failed' and ${emailOutbox.attempts} < ${OUTBOX_MAX_ATTEMPTS}`,
      )
      .returning({ id: emailOutbox.id });

    if (reset.length === 0) {
      return ok(
        exhausted > 0
          ? `Nessuna email da reinviare. ${exhausted} hanno esaurito i tentativi: usa «Forza reinvio» se hai corretto la configurazione.`
          : "Nessuna email fallita da reinviare.",
      );
    }

    const { sent } = await drainOutbox();

    await logAudit({
      actor,
      action: resetAttempts ? "outbox.retry_all_forced" : "outbox.retry_all",
      entity: "email",
      entityId: "outbox",
      summary: `${reset.length} email rimesse in coda${resetAttempts ? " (contatori azzerati)" : ""} — ${sent} inviate`,
      meta: { requeued: reset.length, sent, forced: resetAttempts },
    });

    revalidatePath("/admin/outbox");
    if (!smtpConfigured) {
      return ok(`${reset.length} email rimesse in coda. SMTP non è configurato, quindi non sono state inviate.`);
    }
    return ok(
      `${reset.length} email rimesse in coda, ${sent} inviate${
        exhausted > 0 && !resetAttempts ? ` · ${exhausted} hanno esaurito i tentativi` : ""
      }.`,
    );
  });
}

/**
 * Remove a message that has not been delivered.
 *
 * Until now the only way to stop a queued message (a broadcast sent by mistake,
 * a test to a wrong address) was to let the drain send it. Sent messages are
 * refused: they are the delivery record the order and reservation pages read,
 * and the maintenance sweep already prunes them after OUTBOX_RETENTION_DAYS.
 */
export async function deleteOutboxEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Email non trovata.");

    const [row] = await db
      .select({
        toAddress: emailOutbox.toAddress,
        subject: emailOutbox.subject,
        status: emailOutbox.status,
        attempts: emailOutbox.attempts,
      })
      .from(emailOutbox)
      .where(eq(emailOutbox.id, id))
      .limit(1);
    if (!row) throw new ActionError("Email non trovata.");
    if (row.status === "sent") {
      throw new ActionError("Le email inviate non si eliminano: sono la prova della consegna.");
    }

    await db.delete(emailOutbox).where(eq(emailOutbox.id, id));

    await logAudit({
      actor,
      action: "outbox.delete",
      entity: "email",
      entityId: id,
      summary: `Eliminata "${row.subject}" → ${row.toAddress} (${row.status})`,
      meta: { status: row.status, attempts: row.attempts },
    });

    revalidatePath("/admin/outbox");
    return ok("Email eliminata.");
  });
}
