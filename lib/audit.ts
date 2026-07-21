import "server-only";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export type Actor = { id: string; name?: string | null; username?: string | null };

/**
 * Append one entry to the back-office audit log. Best-effort by design: an audit
 * write must NEVER fail the action it records, so any error is swallowed. Call it
 * AFTER the change has been persisted.
 */
export async function logAudit(input: {
  actor: Actor;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: input.actor.id,
      actorName: input.actor.name || input.actor.username || "",
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      meta: input.meta,
    });
  } catch (err) {
    console.error("[audit] failed to record", input.action, err);
  }
}
