"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { verifyTotp } from "@/lib/auth/totp";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";

/** Confirm TOTP enrolment: verify a code against the pending secret, then enable. */
export async function confirmTotp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const code = String(fd.get("code") ?? "").trim();

    const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
    if (!user?.totpSecret) throw new ActionError("Configurazione non avviata. Ricarica la pagina.");
    if (user.totpEnabled) return ok("La verifica in due passaggi è già attiva.");
    if (!verifyTotp(user.totpSecret, code)) throw new ActionError("Codice non valido. Riprova.");

    await db.update(users).set({ totpEnabled: true }).where(eq(users.id, actor.id));
    await logAudit({ actor, action: "security.2fa_enable", entity: "user", entityId: actor.id, summary: "2FA attivata" });
    revalidatePath("/admin/security");
    return ok("Verifica in due passaggi attivata.");
  });
}

/** Turn off TOTP and clear the secret for the current user. */
export async function disableTotp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    void fd;
    await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, actor.id));
    await logAudit({ actor, action: "security.2fa_disable", entity: "user", entityId: actor.id, summary: "2FA disattivata" });
    revalidatePath("/admin/security");
    return ok("Verifica in due passaggi disattivata.");
  });
}
