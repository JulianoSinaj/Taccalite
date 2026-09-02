import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { generateTotpSecret, verifyTotp } from "@/lib/auth/totp";
import { generateRecoveryCodes, toStored } from "@/lib/auth/recovery-codes";
import { verifyPasswordAsync } from "@/lib/auth/password";
import { logAudit, type Actor } from "@/lib/audit";

/**
 * Two-factor enrolment, independent of who is asking.
 *
 * This used to live entirely inside `lib/admin/security-actions.ts`, which meant
 * 2FA was something only the back office could have. Offering it to customers
 * needed the same four operations behind a different guard and a different
 * revalidate target — and copying security-sensitive code into a second file is
 * how the two versions drift until one of them is wrong.
 *
 * So the operations live here, guardless and route-agnostic: each caller does
 * its own `requireAdmin()` / `requireUser()` and its own `revalidatePath`, and
 * passes in the already-authorised actor. Nothing here decides *whether* a
 * caller may act — only what acting does.
 */

export type EnrolmentResult =
  | { ok: true; message: string; codes?: string[] }
  | { ok: false; error: string };

/**
 * Re-prove who you are before weakening the second factor.
 *
 * Turning 2FA off, and minting a fresh set of recovery codes, were both
 * protected by nothing but holding a live session — which is exactly the thing
 * a second factor exists to survive. Anyone who sat down at an unlocked
 * gestionale, or rode a stolen session cookie, could strip the account back to
 * one factor and let themselves back in later with codes they had generated on
 * the way past. A confirm dialog is a speed bump, not a control.
 *
 * The password is the right proof here rather than a TOTP code: the case this
 * guards against is somebody who has the session but not the credentials, and
 * asking for the authenticator would also lock out the person whose legitimate
 * reason for turning 2FA off is that they no longer have it.
 */
async function assertPassword(actor: Actor, password: string): Promise<EnrolmentResult | null> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  if (!user) return { ok: false, error: "Utente non trovato." };
  if (!password) return { ok: false, error: "Inserisci la tua password per confermare." };
  if (!(await verifyPasswordAsync(password, user.passwordHash))) {
    await logAudit({
      actor,
      action: "security.reauth_failed",
      entity: "user",
      entityId: actor.id,
      summary: "Password errata nel confermare una modifica alla verifica in due passaggi",
    });
    return { ok: false, error: "Password non corretta." };
  }
  return null;
}

/** Mint (or re-mint) a pending secret. Never touches an account already enrolled. */
export async function startEnrolment(actor: Actor): Promise<EnrolmentResult> {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!user) return { ok: false, error: "Account non trovato." };
  if (user.totpEnabled) return { ok: true, message: "La verifica in due passaggi è già attiva." };

  await db.update(users).set({ totpSecret: generateTotpSecret() }).where(eq(users.id, actor.id));
  return { ok: true, message: "Scansiona il QR con la tua app di autenticazione." };
}

/**
 * Confirm enrolment by proving a code against the pending secret.
 *
 * Recovery codes are issued by the same call that enables the factor — an
 * account must never be one lost phone away from lockout, and a separate
 * "now generate your codes" step is a step people skip.
 */
export async function confirmEnrolment(actor: Actor, code: string): Promise<EnrolmentResult> {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!user?.totpSecret) {
    return { ok: false, error: "Configurazione non avviata. Ricarica la pagina." };
  }
  if (user.totpEnabled) return { ok: true, message: "La verifica in due passaggi è già attiva." };
  if (!verifyTotp(user.totpSecret, code)) return { ok: false, error: "Codice non valido. Riprova." };

  const codes = generateRecoveryCodes();
  await db
    .update(users)
    .set({ totpEnabled: true, totpRecoveryCodes: toStored(codes) })
    .where(eq(users.id, actor.id));

  await logAudit({
    actor,
    action: "security.2fa_enable",
    entity: "user",
    entityId: actor.id,
    summary: "2FA attivata",
  });
  return {
    ok: true,
    message:
      "Verifica in due passaggi attivata. Conserva i codici di recupero qui sotto: non potrai rivederli.",
    codes,
  };
}

/** Fresh batch of recovery codes; the previous batch stops working. */
export async function regenerateCodes(actor: Actor, password: string): Promise<EnrolmentResult> {
  const [user] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!user?.totpEnabled) return { ok: false, error: "Attiva prima la verifica in due passaggi." };
  const denied = await assertPassword(actor, password);
  if (denied) return denied;

  const codes = generateRecoveryCodes();
  await db.update(users).set({ totpRecoveryCodes: toStored(codes) }).where(eq(users.id, actor.id));

  await logAudit({
    actor,
    action: "security.recovery_codes",
    entity: "user",
    entityId: actor.id,
    summary: "Codici di recupero 2FA rigenerati (i precedenti non sono più validi)",
  });
  return { ok: true, message: "Nuovi codici generati. I precedenti non funzionano più.", codes };
}

/** Turn the factor off and clear its secret. */
export async function disableEnrolment(actor: Actor, password: string): Promise<EnrolmentResult> {
  const denied = await assertPassword(actor, password);
  if (denied) return denied;

  // The codes go with the secret: they only ever protected this one factor.
  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, totpRecoveryCodes: null })
    .where(eq(users.id, actor.id));
  await logAudit({
    actor,
    action: "security.2fa_disable",
    entity: "user",
    entityId: actor.id,
    summary: "2FA disattivata",
  });
  return { ok: true, message: "Verifica in due passaggi disattivata." };
}
