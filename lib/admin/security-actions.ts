"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireAdmin, deleteOtherUserSessions } from "@/lib/auth/session";
import { verifyTotp } from "@/lib/auth/totp";
import { generateRecoveryCodes, toStored } from "@/lib/auth/recovery-codes";
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

    // Issue recovery codes with the same call that enables 2FA — an account
    // should never be one lost phone away from lockout.
    const codes = generateRecoveryCodes();
    await db
      .update(users)
      .set({ totpEnabled: true, totpRecoveryCodes: toStored(codes) })
      .where(eq(users.id, actor.id));

    await logAudit({ actor, action: "security.2fa_enable", entity: "user", entityId: actor.id, summary: "2FA attivata" });
    revalidatePath("/admin/security");
    return ok(
      "Verifica in due passaggi attivata. Conserva i codici di recupero qui sotto: non potrai rivederli.",
      codes,
    );
  });
}

/**
 * Issue a fresh batch of recovery codes, invalidating any previous batch.
 *
 * The plaintext is returned once, in the action result: only hashes are stored,
 * so there is no way to show them again later.
 */
export async function regenerateRecoveryCodes(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    void fd;

    const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
    if (!user?.totpEnabled) {
      throw new ActionError("Attiva prima la verifica in due passaggi.");
    }

    const codes = generateRecoveryCodes();
    await db.update(users).set({ totpRecoveryCodes: toStored(codes) }).where(eq(users.id, actor.id));

    await logAudit({
      actor,
      action: "security.recovery_codes",
      entity: "user",
      entityId: actor.id,
      summary: "Codici di recupero 2FA rigenerati (i precedenti non sono più validi)",
    });
    revalidatePath("/admin/security");
    return ok("Nuovi codici generati. I precedenti non funzionano più.", codes);
  });
}

/** Sign out every other device for the current user. */
export async function signOutOtherSessions(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    void fd;
    const { deleted } = await deleteOtherUserSessions(actor.id);

    await logAudit({
      actor,
      action: "security.sessions_revoked",
      entity: "user",
      entityId: actor.id,
      summary: `${deleted} altre sessioni chiuse`,
      meta: { deleted },
    });
    revalidatePath("/admin/security");
    return ok(
      deleted === 0
        ? "Nessuna altra sessione attiva."
        : deleted === 1
          ? "1 altra sessione chiusa."
          : `${deleted} altre sessioni chiuse.`,
    );
  });
}

/** Turn off TOTP and clear the secret for the current user. */
export async function disableTotp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    void fd;
    // Clearing the codes with the secret: they only ever protected this factor.
    await db
      .update(users)
      .set({ totpEnabled: false, totpSecret: null, totpRecoveryCodes: null })
      .where(eq(users.id, actor.id));
    await logAudit({ actor, action: "security.2fa_disable", entity: "user", entityId: actor.id, summary: "2FA disattivata" });
    revalidatePath("/admin/security");
    return ok("Verifica in due passaggi disattivata.");
  });
}
