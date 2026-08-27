"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { siteContent } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { contentDef, contentRaw } from "@/lib/site-content";

/**
 * Storefront copy.
 *
 * The key must exist in the code registry: a row for a key nothing renders is
 * dead weight nobody would ever find again, and accepting an arbitrary key from
 * a form would let one be created by hand.
 *
 * Storing a value equal to the built-in default deletes the row instead, so the
 * table only ever holds real deltas and "reset to the original" is a genuine
 * state rather than a copy of the original that then drifts.
 */

const PATHS = ["/", "/la-nostra-storia", "/porchetta", "/privacy", "/cookie", "/termini", "/admin/contenuti"];

export async function saveSiteContent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const key = String(fd.get("key") ?? "").trim();
    const def = contentDef(key);
    if (!def) throw new ActionError("Contenuto non riconosciuto.");

    // Normalise line endings: a textarea posts CRLF on Windows, and the parsers
    // split on "\n" — without this, every trailing "\r" ends up inside the last
    // field of every record.
    const value = String(fd.get("value") ?? "").replace(/\r\n/g, "\n").trimEnd();

    if (value === "" || value === def.default) {
      await db.delete(siteContent).where(eq(siteContent.key, key));
      await logAudit({
        actor,
        action: "content.reset",
        entity: "site_content",
        entityId: key,
        summary: `Contenuto ripristinato al testo originale: ${def.label}`,
        meta: { key },
      });
      PATHS.forEach((p) => revalidatePath(p));
      return ok("Testo ripristinato all'originale.");
    }

    const previous = await contentRaw(key);
    await db
      .insert(siteContent)
      .values({ key, value, updatedByUserId: actor.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteContent.key,
        set: { value, updatedByUserId: actor.id, updatedAt: new Date() },
      });

    await logAudit({
      actor,
      action: "content.update",
      entity: "site_content",
      entityId: key,
      summary: `Contenuto aggiornato: ${def.label}`,
      // The old text, not the new one: the log is where you look when something
      // reads wrong and you want what it said before.
      meta: { key, previousLength: previous.length, length: value.length },
    });
    PATHS.forEach((p) => revalidatePath(p));
    return ok("Testo salvato.");
  });
}
