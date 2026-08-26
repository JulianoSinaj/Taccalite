"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getShopBySlug, getClosures } from "@/lib/db/queries";
import { closureFor } from "@/lib/closures";
import { sendMail } from "@/lib/mail/mailer";
import {
  reservationStatusEmail,
  reservationCustomerEmail,
  porchettaReadyEmail,
  porchettaWaitlistEmail,
  type ReservationEmailData,
} from "@/lib/mail/templates";
import { logAudit } from "@/lib/audit";
import {
  createReservation,
  checkPorchettaCapacity,
  checkSeatsCapacity,
  ReservationNotAllowedError,
} from "@/lib/reservations";
import { type ActionState, runAction, ok, ActionError } from "@/lib/admin/action-state";
import {
  parseForm,
  reservationStatusInput,
  reservationDepositInput,
  reservationDepositOutcomeInput,
  reservationCreateInput,
  reservationDetailsInput,
} from "@/lib/validation/admin";
import { requireShopScope } from "@/lib/admin/scope";

type ReservationRow = typeof reservations.$inferSelect;

/** Revalidate every surface that renders reservations. */
function revalidateReservations(): void {
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/reservations/agenda");
  revalidatePath("/admin/reservations/calendar");
  revalidatePath("/admin");
}

/** Build the shared email payload for a reservation row. */
async function emailDataFor(res: ReservationRow): Promise<ReservationEmailData> {
  const shop = await getShopBySlug(res.shopSlug);
  return {
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
}

/**
 * Load a reservation or fail with a user-facing message — and refuse another
 * location's booking, which is the same check the detail page makes. Every
 * mutating action in this module already came through here, so the boundary
 * lands in one place.
 */
async function mustFindReservation(id: string): Promise<ReservationRow> {
  const [res] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  if (!res) throw new ActionError("Prenotazione non trovata");
  await requireShopScope(res.shopSlug);
  return res;
}

/**
 * Suffix warning when a booking pushes its day past a configured capacity —
 * kilos of porchetta for the location, or seats in the time slot.
 *
 * The back-office never blocks on either: an operator taking a booking on the
 * phone is deciding to accept it. But it must be told what it just did, and
 * seats were never checked at all, so double-booking Saturday dinner used to
 * happen in silence.
 */
async function capacityWarning(
  input: {
    type: string;
    date: string;
    shopSlug: string;
    quantityKg?: number | null;
    time?: string | null;
    guests?: number | null;
  },
  excludeId?: string,
): Promise<string> {
  const parts: string[] = [];

  if (input.type === "porchetta" && input.quantityKg != null) {
    const cap = await checkPorchettaCapacity(input.date, input.quantityKg, {
      excludeId,
      shopSlug: input.shopSlug,
    });
    if (cap.exceeded) {
      parts.push(
        `il ${input.date} supera la capacità della sede (${cap.bookedKg + input.quantityKg} / ${cap.capacityKg} kg)`,
      );
    }
  }

  if (input.type === "table") {
    const seats = await checkSeatsCapacity(input.shopSlug, input.date, input.time, input.guests, {
      excludeId,
    });
    if (seats.exceeded) {
      parts.push(
        `alle ${input.time} ci sono più coperti del previsto (${seats.booked + (input.guests ?? 0)} / ${seats.capacity})`,
      );
    }
  }

  // The public form refuses a closed day outright; here it is a note, because
  // the operator may well be taking a booking for the day the shop reopens and
  // has simply not tidied the closure yet.
  const closure = closureFor(
    await getClosures(),
    input.shopSlug,
    input.date,
    "reservations",
    input.time || undefined,
  );
  if (closure) {
    parts.push(`il ${input.date} risulta chiuso${closure.reason ? ` (${closure.reason})` : ""}`);
  }

  return parts.length > 0 ? ` ⚠ Attenzione: ${parts.join("; ")}.` : "";
}

// ── Create (counter / phone booking) ─────────────────────────────────────────
/**
 * Take a booking from the back-office. Unlike the public form this defaults to
 * `confirmed` (the operator has just agreed it with the customer on the phone),
 * never emails the owner, only emails the customer when explicitly asked, and
 * books past a full porchetta day rather than waitlisting — warning instead.
 */
export async function createAdminReservation(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(reservationCreateInput, fd);
    // The shop arrives in a form field, so the picker being filtered is not the
    // check — a scoped operator could otherwise book into the other location.
    await requireShopScope(d.shopSlug);

    let created;
    try {
      created = await createReservation(
        {
          type: d.type,
          name: d.name,
          phone: d.phone,
          email: d.email,
          shop: d.shopSlug,
          date: d.date,
          time: d.time,
          guests: d.type === "table" ? d.guests ?? undefined : undefined,
          quantityKg: d.type === "porchetta" ? d.quantityKg ?? undefined : undefined,
          notes: d.notes,
        },
        {
          status: d.status,
          notifyOwner: false,
          notifyCustomer: d.notifyCustomer,
          waitlistOnOverflow: false,
          allowDisabledShop: true,
          // The back office warns rather than blocks — see `capacityWarning`.
          enforceAvailability: false,
        },
      );
    } catch (err) {
      if (err instanceof ReservationNotAllowedError) throw new ActionError(err.message);
      throw err;
    }

    if (d.adminNotes) {
      await db
        .update(reservations)
        .set({ adminNotes: d.adminNotes })
        .where(eq(reservations.id, created.id));
    }

    await logAudit({
      actor,
      action: "reservation.create",
      entity: "reservation",
      entityId: created.id,
      summary: `Prenotazione ${created.reference} creata a mano — ${d.name}, ${d.date}${d.time ? ` ${d.time}` : ""} (${d.type})`,
      meta: { type: d.type, date: d.date, shopSlug: d.shopSlug, status: d.status },
    });

    const warning = await capacityWarning(
      { type: d.type, date: d.date, shopSlug: d.shopSlug, quantityKg: d.quantityKg, time: d.time, guests: d.guests },
      created.id,
    );
    revalidateReservations();
    return ok(`Prenotazione ${created.reference} creata.${warning}`);
  });
}

// ── Reschedule / edit details ────────────────────────────────────────────────
/**
 * Change the bookable details of an existing reservation (date, time, party
 * size, kg, shop, contact). Status, deposit and internal notes keep their own
 * actions. Optionally re-sends the confirmation so the customer gets the new
 * details in writing.
 */
export async function updateReservationDetails(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(reservationDetailsInput, fd);
    const res = await mustFindReservation(d.id);
    // Both ends of the move, like `saveProduct`: `mustFindReservation` checked
    // where the booking *is*, this checks where it is being sent. Without it a
    // scoped operator could push a booking into the other location and lose it.
    await requireShopScope(d.shopSlug);

    const shop = await getShopBySlug(d.shopSlug);
    if (!shop) throw new ActionError("Negozio non valido.");

    const dateChanged = res.date !== d.date;
    const next = {
      type: d.type,
      name: d.name,
      phone: d.phone,
      email: d.email ?? null,
      date: d.date,
      time: d.time ?? null,
      guests: d.type === "table" ? d.guests : null,
      quantityKg: d.type === "porchetta" ? d.quantityKg : null,
      shopSlug: d.shopSlug,
      notes: d.notes ?? null,
      // The stamps describe the booking *as it was*. A reminder sent for the
      // old date is no reminder for the new one, so the cron must be free to
      // send again; a porchetta marked ready for last Saturday is not ready for
      // next; and a booking that stops being a porchetta cannot be on the
      // porchetta waitlist.
      remindedAt: dateChanged ? null : res.remindedAt,
      readyAt: dateChanged || d.type !== "porchetta" ? null : res.readyAt,
      waitlisted: d.type === "porchetta" ? res.waitlisted : false,
      updatedAt: new Date(),
    };

    const moved = dateChanged || res.time !== next.time;
    await db.update(reservations).set(next).where(eq(reservations.id, d.id));

    if (d.notifyCustomer) {
      if (!next.email) throw new ActionError("Nessuna email per questa prenotazione.");
      const data = await emailDataFor({ ...res, ...next });
      await sendMail({ to: next.email, ...reservationStatusEmail(data, "confirmed") }).catch(() => {});
    }

    await logAudit({
      actor,
      action: "reservation.update",
      entity: "reservation",
      entityId: res.id,
      summary: moved
        ? `Prenotazione ${res.reference} spostata: ${res.date}${res.time ? ` ${res.time}` : ""} → ${next.date}${next.time ? ` ${next.time}` : ""}`
        : `Prenotazione ${res.reference} aggiornata`,
      meta: { from: { date: res.date, time: res.time }, to: { date: next.date, time: next.time } },
    });

    const warning = await capacityWarning(
      { type: d.type, date: d.date, shopSlug: d.shopSlug, quantityKg: next.quantityKg, time: next.time, guests: next.guests },
      res.id,
    );
    revalidateReservations();
    return ok(`Prenotazione aggiornata.${warning}`);
  });
}

// ── Status ───────────────────────────────────────────────────────────────────
export async function updateReservationStatus(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const data = parseForm(reservationStatusInput, fd);
    const res = await mustFindReservation(data.id);

    // A paid deposit the shop still holds: received, and neither kept nor
    // given back yet.
    const held =
      res.depositCents > 0 && res.depositPaidAt != null && res.depositRefundedAt == null;
    // A no-show forfeits a held deposit outright. A cancellation keeps whatever
    // was already decided about it (`resolveCancelledDeposit` records that).
    // Any active state releases the forfeit again, so an operator who
    // mis-clicked isn't left with money marked as kept.
    const forfeiting = data.status === "no_show" && held;
    const depositForfeitedAt = forfeiting
      ? res.depositForfeitedAt ?? new Date()
      : data.status === "cancelled"
        ? res.depositForfeitedAt
        : null;

    await db
      .update(reservations)
      .set({
        status: data.status,
        adminNotes: data.adminNotes ?? res.adminNotes,
        depositForfeitedAt,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, data.id));

    // Only the two states the customer needs to hear about are emailed. A
    // no-show notice would be salt in the wound and is a phone call, not an
    // automated email.
    if ((data.status === "confirmed" || data.status === "cancelled") && res.email) {
      const emailData = await emailDataFor(res);
      await sendMail({ to: res.email, ...reservationStatusEmail(emailData, data.status) }).catch(() => {});
    }

    await logAudit({
      actor,
      action: "reservation.status",
      entity: "reservation",
      entityId: res.id,
      summary: `Prenotazione ${res.reference}: ${res.status} → ${data.status}`,
      meta: {
        from: res.status,
        to: data.status,
        ...(forfeiting ? { depositForfeitedCents: res.depositCents } : {}),
      },
    });

    revalidateReservations();
    revalidatePath(`/admin/reservations/${res.id}`);
    if (forfeiting) {
      return ok(
        `Prenotazione segnata come non presentata. Caparra di ${(res.depositCents / 100).toFixed(2)} € trattenuta.`,
      );
    }
    if (data.status === "cancelled" && held && !depositForfeitedAt) {
      return ok(
        `Prenotazione annullata. Acconto di ${(res.depositCents / 100).toFixed(2)} € incassato: segna se rimborsato o trattenuto.`,
      );
    }
    return ok("Prenotazione aggiornata.");
  });
}

/**
 * Apply one status to a batch of selected reservations — confirming the
 * morning's pending bookings in a single action rather than one form per row.
 *
 * Runs each through the same `updateReservationStatus` path as a single edit, so
 * customers still get their confirmation/cancellation email; failures are
 * reported rather than aborting the batch.
 */
export async function bulkUpdateReservationStatus(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const ids = fd.getAll("ids").map(String).filter(Boolean);
    const status = String(fd.get("status") ?? "");
    if (ids.length === 0) throw new ActionError("Seleziona almeno una prenotazione.");
    if (!["pending", "confirmed", "completed", "cancelled", "no_show"].includes(status)) {
      throw new ActionError("Stato non valido.");
    }

    let changed = 0;
    const failures: string[] = [];
    for (const id of ids) {
      const single = new FormData();
      single.set("id", id);
      single.set("status", status);
      const res = await updateReservationStatus({ status: "idle" }, single);
      if (res.status === "error") failures.push(res.message ?? id);
      else changed += 1;
    }

    revalidateReservations();
    return failures.length > 0
      ? ok(`${changed} prenotazioni aggiornate, ${failures.length} non modificate.`)
      : ok(`${changed} prenotazioni aggiornate.`);
  });
}

// ── Deposit (caparra) ────────────────────────────────────────────────────────
/** Record a booking deposit: its amount and whether it's been received. */
export async function setReservationDeposit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(reservationDepositInput, fd);
    const res = await mustFindReservation(d.id);

    await db
      .update(reservations)
      .set({
        depositCents: d.depositEuros,
        // Preserve an existing paid timestamp; set/clear based on the paid flag.
        depositPaidAt: d.paid ? res.depositPaidAt ?? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(reservations.id, d.id));

    await logAudit({
      actor,
      action: "reservation.deposit",
      entity: "reservation",
      entityId: d.id,
      summary: `Acconto ${(d.depositEuros / 100).toFixed(2)} € · ${d.paid ? "incassato" : "da incassare"} (${res.reference})`,
      meta: { depositCents: d.depositEuros, paid: d.paid },
    });

    revalidateReservations();
    return ok("Acconto aggiornato.");
  });
}

/**
 * What became of a paid deposit on a booking that did not go ahead.
 *
 * Cancelling a booking used to do nothing at all with its caparra: the money
 * dropped out of the held-deposits total (which only counted live bookings)
 * and out of every report, without anyone saying whether it had been handed
 * back or kept. Either outcome is now an explicit, audited click.
 */
export async function resolveCancelledDeposit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const d = parseForm(reservationDepositOutcomeInput, fd);
    const res = await mustFindReservation(d.id);

    if (res.status !== "cancelled" && res.status !== "no_show") {
      throw new ActionError("L'acconto si definisce solo su una prenotazione annullata o non presentata.");
    }
    if (res.depositCents <= 0 || res.depositPaidAt == null) {
      throw new ActionError("Nessun acconto incassato su questa prenotazione.");
    }

    const now = new Date();
    const refund = d.esito === "rimborsato";
    await db
      .update(reservations)
      .set(
        refund
          ? { depositRefundedAt: res.depositRefundedAt ?? now, depositForfeitedAt: null, updatedAt: now }
          : { depositForfeitedAt: res.depositForfeitedAt ?? now, depositRefundedAt: null, updatedAt: now },
      )
      .where(eq(reservations.id, res.id));

    const amount = `${(res.depositCents / 100).toFixed(2)} €`;
    await logAudit({
      actor,
      action: refund ? "reservation.deposit_refund" : "reservation.deposit_forfeit",
      entity: "reservation",
      entityId: res.id,
      summary: `Acconto ${amount} ${refund ? "rimborsato" : "trattenuto"} (${res.reference}, ${res.status})`,
      meta: { depositCents: res.depositCents, outcome: d.esito, status: res.status },
    });

    revalidateReservations();
    revalidatePath(`/admin/reservations/${res.id}`);
    return ok(refund ? `Acconto di ${amount} segnato come rimborsato.` : `Acconto di ${amount} trattenuto.`);
  });
}

/** Note which table a party was seated at. Free text — see the schema comment. */
export async function setReservationTable(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    const tableNumber = String(fd.get("tableNumber") ?? "").trim().slice(0, 40) || null;
    const res = await mustFindReservation(id);
    if ((res.tableNumber ?? null) === tableNumber) return ok("Nessuna modifica.");

    await db
      .update(reservations)
      .set({ tableNumber, updatedAt: new Date() })
      .where(eq(reservations.id, res.id));

    // Every other change to a booking leaves an audit line; the table did not.
    await logAudit({
      actor,
      action: "reservation.table",
      entity: "reservation",
      entityId: res.id,
      summary: tableNumber
        ? `Prenotazione ${res.reference}: tavolo ${tableNumber}`
        : `Prenotazione ${res.reference}: tavolo rimosso`,
      meta: { from: res.tableNumber, to: tableNumber },
    });

    revalidateReservations();
    revalidatePath(`/admin/reservations/${res.id}`);
    return ok(tableNumber ? `Tavolo ${tableNumber} assegnato.` : "Tavolo rimosso.");
  });
}

/**
 * Re-send the customer's copy of a booking email.
 *
 * Orders have had this for a while and bookings did not, so a lost confirmation
 * — the one carrying the reference code the customer needs at the counter —
 * could only be recovered by bouncing the status, which sent the wrong message
 * and wrote a misleading audit line. Which email goes out follows the booking's
 * current state, exactly as `resendOrderEmail` does.
 */
export async function resendReservationEmail(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const res = await mustFindReservation((fd.get("id") ?? "").toString());
    if (!res.email) throw new ActionError("Questa prenotazione non ha un indirizzo email.");

    // Which email is the *useful* one depends on where the booking has got to.
    // A porchetta already marked ready is about the pickup; a confirmed or
    // cancelled booking has a status notice of its own; anything still open
    // (pending, completed, no-show) wants the original receipt, because the
    // thing the customer actually lost is the reference code on it.
    let what: string;
    if (res.waitlisted && res.type === "porchetta" && res.status !== "cancelled") {
      // Still on the waitlist: the notice that explains it, not a receipt that
      // reads as if the kilos were booked.
      await sendMail({
        to: res.email,
        ...porchettaWaitlistEmail(res.name, res.date, res.quantityKg),
      });
      what = "avviso di lista d'attesa";
    } else if (res.readyAt && res.type === "porchetta") {
      const shop = await getShopBySlug(res.shopSlug);
      await sendMail({
        to: res.email,
        ...porchettaReadyEmail(
          res.name,
          res.date,
          res.quantityKg,
          shop ? { name: shop.name, address: shop.address } : null,
        ),
      });
      what = "avviso di ritiro";
    } else if (res.status === "confirmed" || res.status === "cancelled") {
      const data = await emailDataFor(res);
      await sendMail({ to: res.email, ...reservationStatusEmail(data, res.status) });
      what = res.status === "confirmed" ? "conferma" : "avviso di annullamento";
    } else {
      const data = await emailDataFor(res);
      await sendMail({ to: res.email, ...reservationCustomerEmail(data) });
      what = "riepilogo della richiesta";
    }

    await logAudit({
      actor,
      action: "reservation.resend_email",
      entity: "reservation",
      entityId: res.id,
      summary: `Email reinviata per ${res.reference} (${what}) → ${res.email}`,
      meta: { status: res.status, ready: res.readyAt != null, waitlisted: res.waitlisted, kind: what },
    });

    revalidateReservations();
    revalidatePath(`/admin/reservations/${res.id}`);
    return ok(`Email reinviata a ${res.email}.`);
  });
}

// ── Porchetta workflow ───────────────────────────────────────────────────────
/**
 * Owner marks a porchetta pre-order ready and emails the customer.
 *
 * `ripeti` is what makes the notice re-sendable. Without it this was one-shot:
 * once `readyAt` was stamped the action returned "già inviato" for ever, so a
 * customer who lost the email had no way to be told again short of an operator
 * typing it out by hand. The stamp still guards the *default* path, so clicking
 * twice by accident does not send twice.
 */
export async function markPorchettaReady(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const res = await mustFindReservation((fd.get("id") ?? "").toString());
    const repeat = fd.get("ripeti") === "true";

    if (res.type !== "porchetta") throw new ActionError("Disponibile solo per la porchetta.");
    if (res.readyAt && !repeat) return ok("Avviso di ritiro già inviato.");
    if (!res.email) throw new ActionError("Nessuna email per questa prenotazione.");

    const shop = await getShopBySlug(res.shopSlug);
    const pickup = shop ? { name: shop.name, address: shop.address } : null;
    await sendMail({
      to: res.email,
      ...porchettaReadyEmail(res.name, res.date, res.quantityKg, pickup),
    }).catch(() => {});

    await db
      .update(reservations)
      // Preserve the original stamp on a repeat: it records when the porchetta
      // was actually ready, not when the customer was last reminded.
      .set({ readyAt: res.readyAt ?? new Date(), updatedAt: new Date() })
      .where(eq(reservations.id, res.id));

    await logAudit({
      actor,
      action: repeat ? "reservation.ready_resend" : "reservation.ready",
      entity: "reservation",
      entityId: res.id,
      summary: repeat
        ? `Avviso di ritiro reinviato per ${res.reference} → ${res.email}`
        : `Porchetta ${res.reference} segnata pronta — avviso inviato a ${res.email}`,
      meta: { date: res.date, quantityKg: res.quantityKg, repeat },
    });

    revalidateReservations();
    revalidatePath(`/admin/reservations/${res.id}`);
    return ok(repeat ? "Avviso di ritiro reinviato." : "Avviso di ritiro inviato.");
  });
}

/**
 * Confirm a waitlisted porchetta order. Clears the waitlist flag, moves the
 * booking to confirmed, and tells the customer they're in — the whole point of a
 * waitlist is the promotion notice.
 */
export async function promoteFromWaitlist(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const res = await mustFindReservation((fd.get("id") ?? "").toString());
    if (!res.waitlisted) return ok("Questa prenotazione non è in lista d'attesa.");

    await db
      .update(reservations)
      .set({ waitlisted: false, status: "confirmed", updatedAt: new Date() })
      .where(eq(reservations.id, res.id));

    if (res.email) {
      const emailData = await emailDataFor({ ...res, waitlisted: false, status: "confirmed" });
      await sendMail({ to: res.email, ...reservationStatusEmail(emailData, "confirmed") }).catch(() => {});
    }

    await logAudit({
      actor,
      action: "reservation.promote",
      entity: "reservation",
      entityId: res.id,
      summary: `Prenotazione ${res.reference} confermata dalla lista d'attesa`,
      meta: { date: res.date, quantityKg: res.quantityKg },
    });

    revalidateReservations();
    return ok(
      res.email
        ? "Prenotazione confermata e cliente avvisato."
        : "Prenotazione confermata (nessuna email per avvisare il cliente).",
    );
  });
}
