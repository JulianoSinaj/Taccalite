"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { getShopBySlug } from "@/lib/db/queries";
import { sendMail } from "@/lib/mail/mailer";
import {
  reservationStatusEmail,
  porchettaReadyEmail,
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

    const shop = await getShopBySlug(d.shopSlug);
    if (!shop) throw new ActionError("Negozio non valido.");

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
      updatedAt: new Date(),
    };

    const moved = res.date !== next.date || res.time !== next.time;
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

    // A no-show is the one state that forfeits a deposit the shop already holds.
    // Moving the booking back out of no_show releases the forfeit again, so an
    // operator who mis-clicked isn't left with money marked as kept.
    const forfeiting = data.status === "no_show" && res.depositPaidAt != null;
    const depositForfeitedAt = forfeiting ? res.depositForfeitedAt ?? new Date() : null;

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
    if (forfeiting) {
      return ok(
        `Prenotazione segnata come non presentata. Caparra di ${(res.depositCents / 100).toFixed(2)} € trattenuta.`,
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

/** Note which table a party was seated at. Free text — see the schema comment. */
export async function setReservationTable(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireAdmin();
    const id = String(fd.get("id") ?? "").trim();
    const tableNumber = String(fd.get("tableNumber") ?? "").trim().slice(0, 40) || null;
    const res = await mustFindReservation(id);

    await db
      .update(reservations)
      .set({ tableNumber, updatedAt: new Date() })
      .where(eq(reservations.id, res.id));

    revalidateReservations();
    revalidatePath(`/admin/reservations/${res.id}`);
    return ok(tableNumber ? `Tavolo ${tableNumber} assegnato.` : "Tavolo rimosso.");
  });
}

// ── Porchetta workflow ───────────────────────────────────────────────────────
/** Owner marks a porchetta pre-order ready and emails the customer. Idempotent. */
export async function markPorchettaReady(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireAdmin();
    const res = await mustFindReservation((fd.get("id") ?? "").toString());

    if (res.type !== "porchetta") throw new ActionError("Disponibile solo per la porchetta.");
    if (res.readyAt) return ok("Avviso di ritiro già inviato.");
    if (!res.email) throw new ActionError("Nessuna email per questa prenotazione.");

    const shop = await getShopBySlug(res.shopSlug);
    const pickup = shop ? { name: shop.name, address: shop.address } : null;
    await sendMail({
      to: res.email,
      ...porchettaReadyEmail(res.name, res.date, res.quantityKg, pickup),
    }).catch(() => {});

    await db
      .update(reservations)
      .set({ readyAt: new Date(), updatedAt: new Date() })
      .where(eq(reservations.id, res.id));

    await logAudit({
      actor,
      action: "reservation.ready",
      entity: "reservation",
      entityId: res.id,
      summary: `Porchetta ${res.reference} segnata pronta — avviso inviato a ${res.email}`,
      meta: { date: res.date, quantityKg: res.quantityKg },
    });

    revalidateReservations();
    return ok("Avviso di ritiro inviato.");
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
