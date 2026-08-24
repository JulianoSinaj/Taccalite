"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  clearInstagramToken,
  getInstagramFeed,
  invalidateInstagramFeed,
  refreshInstagramToken,
  saveInstagramToken,
  verifyInstagramToken,
} from "@/lib/instagram";

/** Only the homepage renders the feed; settings shows status. */
function revalidate() {
  revalidatePath("/");
  revalidatePath("/admin/settings");
}

/** Validate a pasted long-lived token against the Graph API, then store it. */
export async function connectInstagram(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const token = (fd.get("token") ?? "").toString().trim();
    if (!token) throw new ActionError("Incolla il token di accesso Instagram.");
    // Tokens are long opaque strings; a sanity bound keeps junk out of the DB.
    if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
      throw new ActionError("Il token non sembra valido (spazi o lunghezza anomala).");
    }
    let username: string;
    try {
      username = (await verifyInstagramToken(token)).username;
    } catch (err) {
      const message = err instanceof Error ? err.message : "errore sconosciuto";
      throw new ActionError(`Instagram ha rifiutato il token: ${message}`);
    }
    await saveInstagramToken(token);
    // Warm the cache now so the homepage shows posts on the very next request.
    await getInstagramFeed();
    // Connecting writes a long-lived credential into `settings`, and every
    // other write to that table is audited. The token itself is never logged —
    // the account it belongs to is the useful half and the safe one.
    await logAudit({
      actor,
      action: "instagram.connect",
      entity: "setting",
      entityId: "instagram.accessToken",
      summary: `Instagram collegato come @${username}`,
      meta: { username },
    });
    revalidate();
    return ok(`Collegato come @${username}. La homepage mostra ora gli ultimi post.`);
  });
}

/** Forget the admin-saved token (falls back to INSTAGRAM_ACCESS_TOKEN, if set). */
export async function disconnectInstagram(): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    await clearInstagramToken();
    await logAudit({
      actor,
      action: "instagram.disconnect",
      entity: "setting",
      entityId: "instagram.accessToken",
      summary: "Instagram scollegato (token rimosso)",
    });
    revalidate();
    return ok("Token rimosso.");
  });
}

/** Drop the cached feed and fetch it again from Instagram. */
export async function refreshInstagramFeedNow(): Promise<ActionState> {
  return runAction(async () => {
    await requireRole("admin");
    await invalidateInstagramFeed();
    const feed = await getInstagramFeed();
    revalidate();
    if (feed.posts.length === 0) {
      throw new ActionError(
        "Aggiornamento eseguito ma nessun post ricevuto: controlla lo stato/errore qui sotto.",
      );
    }
    return ok(`Feed aggiornato: ${feed.posts.length} post.`);
  });
}

/** Exchange the current token for a fresh 60-day one (needs to be ≥24h old). */
export async function refreshInstagramTokenNow(): Promise<ActionState> {
  return runAction(async () => {
    await requireRole("admin");
    try {
      const { expiresAt } = await refreshInstagramToken();
      revalidate();
      return ok(
        `Token rinnovato: scade il ${new Date(expiresAt).toLocaleDateString("it-IT", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "errore sconosciuto";
      throw new ActionError(`Rinnovo non riuscito: ${message}`);
    }
  });
}
