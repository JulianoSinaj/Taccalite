"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { savedViews } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";

/**
 * Saved filter views.
 *
 * Every recurring question — "cosa devo evadere oggi", "scorte basse in Sede 2",
 * "prenotazioni non confermate di sabato" — meant re-selecting the same three
 * facets each time. A view is just a named query string, scoped to one admin
 * path and one user, so it can be restored in a click and doesn't impose one
 * operator's habits on another.
 */

const MAX_PER_PATH = 12;

export async function saveView(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireAdmin();
    const name = String(fd.get("name") ?? "").trim().slice(0, 60);
    const path = String(fd.get("path") ?? "").trim();
    // Stored without the leading "?" and never longer than a sane URL.
    const query = String(fd.get("query") ?? "").replace(/^\?/, "").slice(0, 500);

    if (!name) throw new ActionError("Dai un nome alla vista.");
    if (!path.startsWith("/admin")) throw new ActionError("Percorso non valido.");

    const existing = await db
      .select({ id: savedViews.id, name: savedViews.name })
      .from(savedViews)
      .where(and(eq(savedViews.userId, user.id), eq(savedViews.path, path)));

    // Re-saving under the same name updates it, rather than accumulating
    // near-duplicates called "da evadere", "da evadere 2"…
    const same = existing.find((v) => v.name.toLowerCase() === name.toLowerCase());
    if (same) {
      await db.update(savedViews).set({ query }).where(eq(savedViews.id, same.id));
    } else {
      if (existing.length >= MAX_PER_PATH) {
        throw new ActionError(`Hai già ${MAX_PER_PATH} viste salvate su questa pagina: eliminane una.`);
      }
      await db.insert(savedViews).values({ userId: user.id, path, name, query });
    }

    revalidatePath(path);
    return ok(`Vista «${name}» salvata.`);
  });
}

export async function deleteView(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    const [row] = await db
      .select({ path: savedViews.path })
      .from(savedViews)
      .where(and(eq(savedViews.id, id), eq(savedViews.userId, user.id)))
      .limit(1);
    if (!row) throw new ActionError("Vista non trovata.");

    await db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.userId, user.id)));
    revalidatePath(row.path);
    return ok("Vista eliminata.");
  });
}
