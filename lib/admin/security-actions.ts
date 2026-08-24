"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, deleteOtherUserSessions } from "@/lib/auth/session";
import {
  startEnrolment,
  confirmEnrolment,
  regenerateCodes,
  disableEnrolment,
} from "@/lib/auth/enrolment";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";

/**
 * Back-office two-factor and session controls.
 *
 * The mechanics live in `lib/auth/enrolment.ts` and are shared with the
 * customer-facing equivalents in `lib/account/actions.ts`. What stays here is
 * what is genuinely back-office: the `requireAdmin()` guard (which admits staff
 * too) and the `/admin/security` revalidation.
 */

/**
 * Mint (or re-mint) a pending TOTP secret for the current user.
 *
 * This used to happen in the security page's render body, which made a GET
 * mutate the user row: a link prefetch was enough to rotate the secret, and two
 * concurrent loads could leave someone scanning a QR for a secret that had just
 * been overwritten. Enrolment is a deliberate act, so it takes a deliberate
 * click.
 */
export async function startTotpEnrolment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    void fd;
    const res = await startEnrolment(actor);
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath("/admin/security");
    return ok(res.message);
  });
}

/** Confirm TOTP enrolment: verify a code against the pending secret, then enable. */
export async function confirmTotp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const res = await confirmEnrolment(actor, String(fd.get("code") ?? "").trim());
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath("/admin/security");
    return ok(res.message, res.codes);
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
    const res = await regenerateCodes(actor);
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath("/admin/security");
    return ok(res.message, res.codes);
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
    const res = await disableEnrolment(actor);
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath("/admin/security");
    return ok(res.message);
  });
}
