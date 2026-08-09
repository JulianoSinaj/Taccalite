"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { CRON_JOBS, runCronJob } from "@/lib/automation";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";

/**
 * Run one scheduled job on demand from Settings.
 *
 * Admin-only: these jobs email customers, expire points and close orders. The
 * run goes through the same `runCronJob` wrapper as the scheduler, so it is
 * recorded identically and the panel updates from the same source of truth.
 */
export async function runAutomationNow(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const key = String(fd.get("job") ?? "");
    const job = CRON_JOBS.find((j) => j.key === key);
    if (!job) throw new ActionError("Automazione sconosciuta.");

    const record = await runCronJob(job);

    await logAudit({
      actor,
      action: "automation.run",
      entity: "setting",
      entityId: `cron.${job.key}`,
      summary: `Automazione "${job.label}" eseguita manualmente${record.ok ? "" : " — fallita"}`,
      meta: { job: job.key, ok: record.ok, result: record.result, error: record.error },
    });

    revalidatePath("/admin/settings");
    if (!record.ok) throw new ActionError(`Esecuzione fallita: ${record.error}`);
    return ok(`"${job.label}" eseguita: ${summarize(record.result)}`);
  });
}

/** Turn a job's return value into a one-line Italian summary for the operator. */
function summarize(result: unknown): string {
  if (!result || typeof result !== "object") return "completata.";
  const r = result as Record<string, unknown>;

  if (typeof r.sent === "number") return `${r.sent} email inviate.`;
  if (r.skipped === true) return "già eseguita oggi, nessun invio.";
  if (typeof r.reservations === "number") {
    return `riepilogo inviato (${r.reservations} prenotazioni, ${r.orders} ordini, ${r.lowStock} scorte basse).`;
  }
  if (typeof r.fulfilled === "number") {
    return r.afterDays === 0
      ? "disattivata (imposta i giorni per abilitarla)."
      : `${r.fulfilled} ordini da ritiro chiusi.`;
  }
  if (typeof r.accountsExpired === "number") {
    return r.accountsExpired === 0
      ? "nessun account con punti scaduti."
      : `${r.accountsExpired} account azzerati (${r.pointsExpired} punti).`;
  }
  if (typeof r.sessionsDeleted === "number") {
    return `${r.sessionsDeleted} sessioni rimosse, ${r.outboxDrained} email inviate, ${r.outboxPruned} archiviate.`;
  }
  return "completata.";
}
