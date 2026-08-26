"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, newsletterSubscribers, reservations } from "@/lib/db/schema";
import { getShopBySlug } from "@/lib/db/queries";
import { sendMail } from "@/lib/mail/mailer";
import {
  reservationCancelledByCustomerEmail,
  reservationCustomerCancelledOwnerEmail,
  type ReservationEmailData,
} from "@/lib/mail/templates";
import { env } from "@/lib/env";
import { dateInRome } from "@/lib/time";
import { requireUser, deleteOtherUserSessions } from "@/lib/auth/session";
import {
  startEnrolment,
  confirmEnrolment,
  regenerateCodes,
  disableEnrolment,
} from "@/lib/auth/enrolment";
import { changePassword, sendVerificationEmail } from "@/lib/auth/service";
import { subscribeNewsletter } from "@/lib/newsletter";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/lib/addresses";
import { logAudit } from "@/lib/audit";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import { parseForm } from "@/lib/validation/admin";
import { passwordChangeSchema, profileSchema } from "@/lib/validation/auth";

/**
 * Everything a customer can do to their own account.
 *
 * Every action here guards with `requireUser()` and acts on **that** user's id —
 * never on an id from the form. A server action is reachable by direct POST, so
 * accepting a `userId` field would turn this whole file into an "edit anyone"
 * API. The only ids read from form data are those of child records (an address),
 * and every one of those is looked up scoped to the owner.
 */

const ACCOUNT_PATH = "/account/impostazioni";

/** Update the customer's own contact details. */
export async function updateOwnProfile(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const d = parseForm(profileSchema, fd);

    const [current] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
    if (!current) throw new ActionError("Account non trovato.");

    const emailChanged = d.email !== (current.email ?? "").toLowerCase();
    if (emailChanged) {
      const [clash] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(sql`lower(${users.email})`, d.email))
        .limit(1);
      if (clash && clash.id !== actor.id) {
        throw new ActionError("Questo indirizzo è già usato da un altro account.");
      }
    }

    // Name and phone are written immediately; the address is NOT. A new address
    // has to prove itself first — writing it straight to the row would let a
    // typo (or someone at an unlocked screen) move the account's recovery
    // channel somewhere nobody controls. `verifyEmailToken` does the write when
    // the link is clicked.
    await db
      .update(users)
      .set({ name: d.name, phone: d.phone ?? null })
      .where(eq(users.id, actor.id));

    if (emailChanged) {
      await sendVerificationEmail(actor, d.email);
      await logAudit({
        actor,
        action: "account.email_change_requested",
        entity: "user",
        entityId: actor.id,
        summary: `${actor.username} ha chiesto di cambiare email in ${d.email} (in attesa di conferma)`,
      });
      revalidatePath(ACCOUNT_PATH);
      return ok(
        `Ti abbiamo scritto a ${d.email}: conferma dal link per completare il cambio indirizzo.`,
      );
    }

    revalidatePath(ACCOUNT_PATH);
    revalidatePath("/account");
    return ok("Dati aggiornati.");
  });
}

/** Change one's own password (current password required). */
export async function changeOwnPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const d = parseForm(passwordChangeSchema, fd);
    const res = await changePassword(actor.id, d);
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath(ACCOUNT_PATH);
    return ok("Password aggiornata. Le altre sessioni sono state chiuse.");
  });
}

/** Sign out every other device. */
export async function signOutOtherDevices(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    void fd;
    const { deleted } = await deleteOtherUserSessions(actor.id);
    await logAudit({
      actor,
      action: "security.sessions_revoked",
      entity: "user",
      entityId: actor.id,
      summary: `${deleted} altre sessioni chiuse dall'area personale`,
      meta: { deleted },
    });
    revalidatePath(ACCOUNT_PATH);
    return ok(
      deleted === 0
        ? "Nessun altro dispositivo collegato."
        : deleted === 1
          ? "1 altro dispositivo disconnesso."
          : `${deleted} altri dispositivi disconnessi.`,
    );
  });
}

/** Send a fresh verification link to the address already on the account. */
export async function resendOwnVerification(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    void fd;
    if (!actor.email) throw new ActionError("Aggiungi prima un indirizzo email.");
    if (actor.emailVerifiedAt) return ok("Il tuo indirizzo è già confermato.");
    await sendVerificationEmail(actor, actor.email);
    return ok("Ti abbiamo inviato un nuovo link di conferma.");
  });
}

/** Opt in or out of marketing email, keeping the consent flag and the
 *  newsletter list in step — they used to be able to disagree. */
export async function setMarketingConsent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const wanted = fd.get("consent") === "on" || fd.get("consent") === "true";

    await db.update(users).set({ marketingConsent: wanted }).where(eq(users.id, actor.id));

    if (actor.email) {
      if (wanted) {
        // Still double opt-in: the flag records the ask, the confirmation email
        // records the permission.
        await subscribeNewsletter(actor.email, "account").catch(() => {});
      } else {
        await db
          .update(newsletterSubscribers)
          .set({ status: "unsubscribed" })
          .where(eq(sql`lower(${newsletterSubscribers.email})`, actor.email.toLowerCase()));
      }
    }

    revalidatePath(ACCOUNT_PATH);
    return ok(
      wanted
        ? "Grazie! Ti abbiamo scritto per confermare l'iscrizione."
        : "Non riceverai più le nostre email.",
    );
  });
}

// ── Two-factor ───────────────────────────────────────────────────────────────

export async function startOwnTotpEnrolment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    void fd;
    const res = await startEnrolment(actor);
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath(ACCOUNT_PATH);
    return ok(res.message);
  });
}

export async function confirmOwnTotp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const res = await confirmEnrolment(actor, String(fd.get("code") ?? "").trim());
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath(ACCOUNT_PATH);
    return ok(res.message, res.codes);
  });
}

export async function regenerateOwnRecoveryCodes(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    void fd;
    const res = await regenerateCodes(actor);
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath(ACCOUNT_PATH);
    return ok(res.message, res.codes);
  });
}

export async function disableOwnTotp(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    void fd;
    const res = await disableEnrolment(actor);
    if (!res.ok) throw new ActionError(res.error);
    revalidatePath(ACCOUNT_PATH);
    return ok(res.message);
  });
}

// ── Addresses ────────────────────────────────────────────────────────────────

const addressInput = z.object({
  id: z.string().trim().max(60).optional(),
  label: z.string().trim().max(60).optional(),
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  street: z.string().trim().min(3, "Inserisci via e numero").max(200),
  city: z.string().trim().min(2, "Inserisci il comune").max(120),
  postcode: z.string().trim().regex(/^\d{5}$/, "Il CAP ha 5 cifre"),
  province: z.string().trim().max(4).optional(),
  notes: z.string().trim().max(300).optional(),
  isDefault: z.coerce.boolean().optional().default(false),
});

export async function saveOwnAddress(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const d = parseForm(addressInput, fd);

    if (d.id) {
      // Scoped to the owner inside `updateAddress`: an id from the form is never
      // sufficient on its own.
      const updated = await updateAddress(actor.id, d.id, d);
      if (!updated) throw new ActionError("Indirizzo non trovato.");
      revalidatePath(ACCOUNT_PATH);
      return ok("Indirizzo aggiornato.");
    }

    await createAddress(actor.id, d);
    revalidatePath(ACCOUNT_PATH);
    return ok("Indirizzo salvato.");
  });
}

export async function deleteOwnAddress(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Indirizzo non valido.");
    const deleted = await deleteAddress(actor.id, id);
    if (!deleted) throw new ActionError("Indirizzo non trovato.");
    revalidatePath(ACCOUNT_PATH);
    return ok("Indirizzo eliminato.");
  });
}

export async function makeOwnAddressDefault(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const id = String(fd.get("id") ?? "").trim();
    const done = await setDefaultAddress(actor.id, id);
    if (!done) throw new ActionError("Indirizzo non trovato.");
    revalidatePath(ACCOUNT_PATH);
    return ok("Indirizzo predefinito aggiornato.");
  });
}

// ── GDPR ─────────────────────────────────────────────────────────────────────

/**
 * Ask for the account to be erased.
 *
 * Records the request and tells the shop; it deliberately does not run
 * `anonymizeUser` unattended. Erasure is irreversible, the customer may have an
 * order in flight, and orders themselves are retained under fiscal obligation
 * regardless — so this is a conversation the bottega has to be able to have
 * before the data goes. The audit line is what the operator acts on.
 */
export async function requestOwnErasure(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);

    await logAudit({
      actor,
      action: "gdpr.erase_requested",
      entity: "user",
      entityId: actor.id,
      summary: `${actor.username} ha richiesto la cancellazione dei propri dati${
        reason ? ` — "${reason}"` : ""
      }`,
      meta: { reason: reason || null, email: actor.email },
    });

    revalidatePath(ACCOUNT_PATH);
    return ok(
      "Richiesta registrata. Ti ricontattiamo entro 30 giorni: gli ordini restano per obblighi fiscali.",
    );
  });
}

// ── Reservations ─────────────────────────────────────────────────────────────
/**
 * Cancel one of the customer's own upcoming bookings.
 *
 * Every cancellation used to be a phone call the shop then had to act on by
 * hand. The customer can do it from their account — for their own bookings
 * only (looked up by owner, never by id alone), and only while there is still
 * something to cancel: a booking already closed, or whose day has passed, is
 * history, and what became of it is for the shop to record.
 *
 * A paid deposit is left exactly as it is: the shop decides whether it goes
 * back or is kept, on the booking's page in the back office.
 */
export async function cancelOwnReservation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireUser();
    const id = String(fd.get("id") ?? "").trim();
    if (!id) throw new ActionError("Prenotazione non trovata.");

    const [res] = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.id, id), eq(reservations.userId, actor.id)))
      .limit(1);
    if (!res) throw new ActionError("Prenotazione non trovata.");
    if (res.status === "cancelled") return ok("Questa prenotazione è già annullata.");
    if (res.status !== "pending" && res.status !== "confirmed") {
      throw new ActionError("Questa prenotazione è già chiusa e non si può annullare.");
    }
    if (res.date < dateInRome()) {
      throw new ActionError("La data è già passata: per qualsiasi cosa contatta la bottega.");
    }

    await db
      .update(reservations)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(reservations.id, res.id));

    const shop = await getShopBySlug(res.shopSlug);
    const data: ReservationEmailData = {
      reference: res.reference,
      type: res.type,
      name: res.name,
      phone: res.phone,
      email: res.email,
      date: res.date,
      time: res.time,
      guests: res.guests,
      quantityKg: res.quantityKg,
      shopName: shop?.name ?? res.shopSlug,
      notes: res.notes,
    };
    // The shop must hear about it — a freed Saturday table or two kilos of
    // porchetta are worth re-selling — and the customer gets it in writing.
    // Neither email may fail the cancellation, which is already saved.
    const jobs: Promise<unknown>[] = [
      sendMail({ to: env.ownerEmail, ...reservationCustomerCancelledOwnerEmail(data) }),
    ];
    if (res.email) jobs.push(sendMail({ to: res.email, ...reservationCancelledByCustomerEmail(data) }));
    await Promise.allSettled(jobs);

    await logAudit({
      actor,
      action: "reservation.cancel_by_customer",
      entity: "reservation",
      entityId: res.id,
      summary: `Prenotazione ${res.reference} annullata dal cliente (${res.date}${res.time ? ` ${res.time}` : ""})`,
      meta: {
        from: res.status,
        type: res.type,
        date: res.date,
        depositCents: res.depositCents,
        depositPaid: res.depositPaidAt != null,
      },
    });

    revalidatePath("/account");
    revalidatePath("/admin/reservations");
    revalidatePath("/admin");
    return ok(
      res.depositCents > 0 && res.depositPaidAt
        ? "Prenotazione annullata. Per l'acconto versato ti contatteremo noi."
        : "Prenotazione annullata.",
    );
  });
}
