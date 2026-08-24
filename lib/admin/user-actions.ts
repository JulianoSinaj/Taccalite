"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireAdmin, requireRole, deleteUserSessions } from "@/lib/auth/session";
import { hashPasswordAsync } from "@/lib/auth/password";
import { countAdmins } from "@/lib/admin/queries";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  parseForm,
  userRoleInput,
  userPasswordInput,
  userProfileInput,
  staffCustomerInput,
} from "@/lib/validation/admin";
import { logAudit } from "@/lib/audit";
import { anonymizeUser } from "@/lib/gdpr";
import { getOrCreateLoyaltyAccount } from "@/lib/loyalty";
import { deriveUsername, sendVerificationEmail } from "@/lib/auth/service";
import { subscribeNewsletter } from "@/lib/newsletter";
import { randomBytes } from "node:crypto";

/** New-account fields. Username is normalised to lowercase and constrained to a
 *  safe handle charset; email is optional. */
const createUserInput = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Lo username deve avere almeno 3 caratteri")
    .max(40, "Lo username può avere al massimo 40 caratteri")
    .regex(/^[a-z0-9._-]+$/, "Username non valido (solo lettere minuscole, numeri, . _ -)"),
  name: z.string().trim().min(1, "Il nome è obbligatorio").max(200),
  email: z
    .string()
    .trim()
    .max(200)
    .email("Email non valida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri").max(200),
  role: z.enum(["customer", "staff", "admin"]),
  /** Only meaningful for staff; blank means every location. */
  shopSlug: z.string().trim().max(80).optional(),
});

/** Toggle an account's active flag. */
const userActiveInput = z.object({
  id: z.string().trim().min(1),
  active: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => v === "on" || v === "true" || v === "1"),
});

/** Change a user's role. Admin-only; refuses to demote the last remaining admin. */
export async function setUserRole(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(userRoleInput, fd);

    const [target] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
    if (!target) throw new ActionError("Utente non trovato");

    if (target.role === "admin" && d.role !== "admin") {
      const admins = await countAdmins();
      if (admins <= 1) throw new ActionError("Non puoi rimuovere l'ultimo amministratore.");
    }

    // The shop assignment is part of the privilege, so it moves with the role in
    // one write: promoting a counter person to admin must not leave them pinned
    // to one location, and demoting an admin must not silently grant them every
    // location for ever.
    const shopSlug = d.role === "staff" ? d.shopSlug ?? null : null;
    await db.update(users).set({ role: d.role, shopSlug }).where(eq(users.id, d.id));
    // Force re-auth so the new privilege level takes effect immediately (a
    // demotion must not keep an elevated session alive).
    await deleteUserSessions(d.id);
    await logAudit({
      actor,
      action: "user.role",
      entity: "user",
      entityId: target.id,
      summary:
        `Ruolo di ${target.username}: ${target.role} → ${d.role}` +
        (shopSlug ? ` (sede ${shopSlug})` : target.shopSlug ? " (tutte le sedi)" : ""),
      meta: { from: target.role, to: d.role, shopSlug },
    });
    revalidatePath("/admin/users");
    return ok(`Ruolo aggiornato a "${d.role}".`);
  });
}

/** Reset a user's password. Admin-only. */
export async function resetUserPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(userPasswordInput, fd);
    const [target] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
    const passwordHash = await hashPasswordAsync(d.password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, d.id));
    // A password reset must log the user out everywhere.
    await deleteUserSessions(d.id);
    await logAudit({
      actor,
      action: "user.password_reset",
      entity: "user",
      entityId: d.id,
      summary: `Password reimpostata per ${target?.username ?? d.id}`,
    });
    revalidatePath("/admin/users");
    return ok("Password reimpostata.");
  });
}

/**
 * Update an account's contact details (name / email / phone). Admin-only.
 *
 * Changing the email clears `emailVerifiedAt` — the new address hasn't proven
 * itself — and is rejected when another account already holds it (the column is
 * unique). Role, username and password have their own guarded actions.
 */
export async function updateUserProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(userProfileInput, fd);

    const [target] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
    if (!target) throw new ActionError("Utente non trovato");

    const emailChanged = (d.email ?? null) !== (target.email ?? null);
    if (emailChanged && d.email) {
      const [clash] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, d.email))
        .limit(1);
      if (clash && clash.id !== d.id) throw new ActionError("Email già in uso da un altro account.");
    }

    await db
      .update(users)
      .set({
        name: d.name,
        email: d.email ?? null,
        phone: d.phone ?? null,
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      })
      .where(eq(users.id, d.id));

    // Describe what actually changed, so the audit trail is readable.
    const changes: string[] = [];
    if (d.name !== target.name) changes.push(`nome "${target.name}" → "${d.name}"`);
    if (emailChanged) changes.push(`email ${target.email ?? "—"} → ${d.email ?? "—"}`);
    if ((d.phone ?? null) !== (target.phone ?? null)) {
      changes.push(`telefono ${target.phone ?? "—"} → ${d.phone ?? "—"}`);
    }
    if (changes.length === 0) return ok("Nessuna modifica.");

    await logAudit({
      actor,
      action: "user.profile",
      entity: "user",
      entityId: target.id,
      summary: `Anagrafica di ${target.username}: ${changes.join(", ")}`,
      meta: { name: d.name, email: d.email ?? null, phone: d.phone ?? null },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/loyalty/${d.id}`);
    return ok("Anagrafica aggiornata.");
  });
}

/** Create a new account. Admin-only; rejects a duplicate username. */
export async function createUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(createUserInput, fd);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, d.username))
      .limit(1);
    if (existing) throw new ActionError("Username già in uso.");

    const passwordHash = await hashPasswordAsync(d.password);
    const [created] = await db
      .insert(users)
      .values({
        username: d.username,
        name: d.name,
        email: d.email,
        passwordHash,
        role: d.role,
        // Only meaningful for staff: an admin sees every location by definition,
        // and a customer has no back-office view to confine.
        shopSlug: d.role === "staff" ? d.shopSlug || null : null,
      })
      .returning({ id: users.id });

    await logAudit({
      actor,
      action: "user.create",
      entity: "user",
      entityId: created?.id,
      summary: `Nuovo utente ${d.username} (${d.role}${
        d.role === "staff" && d.shopSlug ? `, sede ${d.shopSlug}` : ""
      })`,
      meta: { role: d.role, shopSlug: d.role === "staff" ? d.shopSlug || null : null },
    });
    revalidatePath("/admin/users");
    return ok("Utente creato.");
  });
}

/**
 * Enrol a walk-in customer at the counter — available to **staff**, not only to
 * admins.
 *
 * `createUser` next door is admin-only, and rightly so: it can mint an
 * administrator. But that meant the person actually standing at the till could
 * credit points to an existing card and could not create one, so the loyalty
 * programme had no way in from the shop floor — the only place most of these
 * customers ever appear. This action is the narrow version of that power: it can
 * only ever produce a `customer`, never a role, never a shop assignment.
 *
 * The account gets an unusable random password rather than a chosen one. Nobody
 * should be inventing a password for someone else at a counter — and the owner
 * has a real route in (email + "password dimenticata") the moment they want one.
 */
export async function createCustomerAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    // requireAdmin() admits admin AND staff — see lib/auth/session.ts.
    const actor = await requireAdmin();
    const d = parseForm(staffCustomerInput, fd);

    if (d.email) {
      const [clash] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, d.email))
        .limit(1);
      if (clash) {
        throw new ActionError("Esiste già un account con questa email.");
      }
    }

    const username = await deriveUsername(d.email ?? `cliente-${randomBytes(4).toString("hex")}@banco.local`);
    const [created] = await db
      .insert(users)
      .values({
        username,
        name: d.name,
        email: d.email ?? null,
        phone: d.phone ?? null,
        // Random and never shown to anyone: this is a card, not a login. The
        // owner sets a real password via the reset flow if they ever want one.
        passwordHash: await hashPasswordAsync(randomBytes(32).toString("hex")),
        role: "customer",
        marketingConsent: d.marketingConsent ?? false,
      })
      .returning({ id: users.id, name: users.name, username: users.username });

    const account = await getOrCreateLoyaltyAccount(created.id);

    // Give them a way to take ownership, when there is an address to send it to.
    if (d.email) {
      await sendVerificationEmail(created, d.email);
      if (d.marketingConsent) await subscribeNewsletter(d.email, "banco").catch(() => {});
    }

    await logAudit({
      actor,
      action: "user.create",
      entity: "user",
      entityId: created.id,
      summary: `Cliente ${d.name} iscritto al banco (tessera ${account.cardNumber})`,
      meta: { cardNumber: account.cardNumber, viaCounter: true },
    });

    revalidatePath("/admin/users");
    revalidatePath("/admin/loyalty");
    return ok(`Tessera ${account.cardNumber} creata per ${d.name}.`);
  });
}

/** Activate or deactivate an account. Admin-only; refuses to deactivate the last
 *  remaining admin and force-logs-out an account on deactivation. */
export async function setUserActive(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const d = parseForm(userActiveInput, fd);

    const [target] = await db.select().from(users).where(eq(users.id, d.id)).limit(1);
    if (!target) throw new ActionError("Utente non trovato");

    if (!d.active && target.role === "admin") {
      const admins = await countAdmins();
      if (admins <= 1) throw new ActionError("Non puoi disattivare l'ultimo amministratore.");
    }

    await db.update(users).set({ active: d.active }).where(eq(users.id, d.id));

    if (!d.active) {
      // A deactivation must take effect immediately: kill any live session.
      await deleteUserSessions(d.id);
    }

    await logAudit({
      actor,
      action: "user.active",
      entity: "user",
      entityId: target.id,
      summary: `${target.username} ${d.active ? "riattivato" : "disattivato"}`,
      meta: { active: d.active },
    });
    revalidatePath("/admin/users");
    return ok(d.active ? "Utente riattivato." : "Utente disattivato.");
  });
}

/**
 * Turn off another account's two-factor auth. Admin-only.
 *
 * The recovery-code path covers a lost phone, but not a lost phone *and* lost
 * codes — and every action in `security-actions.ts` targets the caller, so that
 * combination was only fixable by editing the database. A staff member locked
 * out of a shop's back office on a Saturday morning is an operational problem,
 * not a security feature.
 *
 * Deliberately narrow: it clears the factor and nothing else, kills the target's
 * sessions so a half-authenticated one can't survive, and is audited. Re-enrolling
 * remains the user's own job from /admin/security.
 */
export async function resetUserTotp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Utente non valido.");

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new ActionError("Utente non trovato");
    if (!target.totpEnabled && !target.totpSecret) {
      return ok("Questo account non ha la verifica in due passaggi attiva.");
    }

    await db
      .update(users)
      .set({ totpEnabled: false, totpSecret: null, totpRecoveryCodes: null })
      .where(eq(users.id, id));
    await deleteUserSessions(id);

    await logAudit({
      actor,
      action: "security.2fa_reset",
      entity: "user",
      entityId: id,
      summary: `2FA azzerata per ${target.username} da un amministratore (sessioni chiuse)`,
    });
    revalidatePath("/admin/users");
    return ok(
      `Verifica in due passaggi disattivata per ${target.username}. Chiedigli di riattivarla da «Sicurezza».`,
    );
  });
}

/**
 * Mark an account's email as verified by hand, or send the verification again.
 *
 * The address on a counter-created account is often taken down over the phone
 * and confirmed out-of-band; without this the account stays permanently
 * "da verificare" with nothing an operator can do about it.
 */
export async function setEmailVerified(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    const verified = fd.get("verified") !== "false";

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new ActionError("Utente non trovato");
    if (!target.email) throw new ActionError("Questo account non ha un'email.");

    await db
      .update(users)
      .set({ emailVerifiedAt: verified ? new Date() : null })
      .where(eq(users.id, id));

    await logAudit({
      actor,
      action: "user.email_verified",
      entity: "user",
      entityId: id,
      summary: `Email di ${target.username} segnata come ${verified ? "verificata" : "da verificare"} (${target.email})`,
      meta: { verified },
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/loyalty/${id}`);
    return ok(verified ? "Email segnata come verificata." : "Email segnata come da verificare.");
  });
}

/**
 * GDPR erasure (art. 17): anonymize a customer's account, reservations and
 * newsletter subscription. Admin-only; refuses to erase an admin account (demote
 * first) and always retains order records under the fiscal-retention obligation.
 */
export async function anonymizeCustomer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Utente non valido.");

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw new ActionError("Utente non trovato.");
    if (target.role === "admin") {
      throw new ActionError("Non puoi anonimizzare un amministratore. Cambia prima il ruolo.");
    }

    const ok_ = await anonymizeUser(id);
    if (!ok_) throw new ActionError("Anonimizzazione non riuscita.");

    await logAudit({
      actor,
      action: "gdpr.erase",
      entity: "user",
      entityId: id,
      summary: `Dati personali anonimizzati per ${target.username} (ordini conservati per obblighi fiscali)`,
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/loyalty/${id}`);
    return ok("Dati personali anonimizzati. Gli ordini restano per obblighi fiscali.");
  });
}

/**
 * Clear a login lockout, and sign the account out everywhere.
 *
 * Ten failed attempts lock an account for fifteen minutes
 * (`lib/auth/service`), and the lock expires on its own — which is the right
 * design and left the operator with nothing to say to somebody standing in
 * front of them. Two separate needs met here: an admin can lift the lock now
 * rather than telling a colleague to wait, and — because a lockout usually
 * means somebody was guessing at the password — can end every live session at
 * the same time, which is the response that actually matters if the guessing
 * worked.
 */
export async function unlockUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    const id = String(fd.get("id") ?? "").trim();
    const signOut = String(fd.get("signOut") ?? "") === "true";

    const [target] = await db
      .select({
        username: users.username,
        failedLoginCount: users.failedLoginCount,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!target) throw new ActionError("Utente non trovato.");

    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, id));

    const ended = signOut ? (await deleteUserSessions(id)).deleted : 0;

    await logAudit({
      actor,
      action: "user.unlock",
      entity: "user",
      entityId: id,
      summary: `Blocco accessi rimosso per @${target.username}${
        signOut ? ` e ${ended} sessioni chiuse` : ""
      }`,
      meta: { failedLoginCount: target.failedLoginCount, signOut, sessionsEnded: ended },
    });

    revalidatePath("/admin/users");
    return ok(
      signOut
        ? `Blocco rimosso e ${ended} ${ended === 1 ? "sessione chiusa" : "sessioni chiuse"}.`
        : "Blocco rimosso: l'account può riprovare subito.",
    );
  });
}
