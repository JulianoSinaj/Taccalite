import "server-only";
import { customAlphabet } from "nanoid";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema";
import { getShopBySlug, getSetting } from "@/lib/db/queries";
import { sendMail } from "@/lib/mail/mailer";
import {
  reservationCustomerEmail,
  reservationOwnerEmail,
  porchettaWaitlistEmail,
  type ReservationEmailData,
} from "@/lib/mail/templates";
import { env } from "@/lib/env";
import type { ReservationInput } from "@/lib/validation/reservation";

const refCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export function generateReference(): string {
  return `TAC-${refCode()}`;
}

export type CreateReservationResult = {
  reference: string;
  id: string;
};

/** Thrown when a shop can't take this kind of reservation (surfaced to the user). */
export class ReservationNotAllowedError extends Error {}

export type PorchettaCapacity = {
  /** Configured weekly cap in kg; 0 = no limit. */
  capacityKg: number;
  /** Kg already booked (non-cancelled) for that date, excluding `excludeId`. */
  bookedKg: number;
  /** True when booking `requestedKg` would push the day over the cap. */
  exceeded: boolean;
};

/**
 * How full a porchetta day is, and whether `requestedKg` would overflow it.
 *
 * Shared by the public booking flow (which waitlists on overflow) and the
 * back-office create/reschedule actions (which warn but let the operator
 * override — a phone booking is a deliberate decision). Pass `excludeId` when
 * re-checking an existing reservation so it isn't counted against itself.
 */
export async function checkPorchettaCapacity(
  date: string,
  requestedKg: number,
  opts: { excludeId?: string } = {},
): Promise<PorchettaCapacity> {
  const capacityKg = await getSetting<number>("porchetta.weeklyCapacityKg", 0);
  if (capacityKg <= 0) return { capacityKg: 0, bookedKg: 0, exceeded: false };

  const conds = [
    eq(reservations.type, "porchetta"),
    eq(reservations.date, date),
    ne(reservations.status, "cancelled"),
  ];
  if (opts.excludeId) conds.push(ne(reservations.id, opts.excludeId));

  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${reservations.quantityKg}), 0)` })
    .from(reservations)
    .where(and(...conds));

  const bookedKg = Number(total);
  return { capacityKg, bookedKg, exceeded: bookedKg + requestedKg > capacityKg };
}

/** Extra behaviour for callers other than the public booking form. */
export type CreateReservationOptions = {
  /** Link the booking to a customer account. */
  userId?: string;
  /** Initial status. Public bookings arrive `pending`; a booking taken by staff
   *  is already agreed, so the back-office passes `confirmed`. */
  status?: "pending" | "confirmed";
  /** Email the owner that a booking came in. Pointless when the owner is the one
   *  entering it. */
  notifyOwner?: boolean;
  /** Send the customer their confirmation (only ever when an email is known). */
  notifyCustomer?: boolean;
  /** Waitlist a porchetta order that exceeds the weekly cap. The back-office
   *  turns this off: an operator taking the booking is overriding on purpose. */
  waitlistOnOverflow?: boolean;
  /** Skip the per-shop "accepts this kind of booking" gates. Those flags govern
   *  the *public* forms; a shop that has closed online bookings still takes them
   *  by phone, so the back-office books regardless. The shop must still exist. */
  allowDisabledShop?: boolean;
};

/**
 * Persist a reservation and fire the notification + confirmation emails.
 * Email failures never fail the reservation (it's already saved); they are
 * recorded in the outbox.
 */
export async function createReservation(
  input: ReservationInput,
  meta?: CreateReservationOptions,
): Promise<CreateReservationResult> {
  const {
    status = "pending",
    notifyOwner = true,
    notifyCustomer = true,
    waitlistOnOverflow = true,
    allowDisabledShop = false,
  } = meta ?? {};
  const shop = await getShopBySlug(input.shop);
  if (!shop) {
    throw new ReservationNotAllowedError("Negozio non valido. Scegli una sede disponibile.");
  }
  if (!allowDisabledShop) {
    if (input.type === "porchetta" && !shop.porchettaEnabled) {
      throw new ReservationNotAllowedError("Questa sede non prepara la porchetta del sabato.");
    }
    if (input.type !== "porchetta" && !shop.reservationsEnabled) {
      throw new ReservationNotAllowedError("Questa sede non accetta prenotazioni al momento.");
    }
  }
  const shopName = shop.name;
  const reference = generateReference();
  const date = input.date ?? new Date().toISOString().slice(0, 10);

  // Porchetta capacity: when a weekly cap is configured and this order would push
  // the day over it, the booking goes on the waitlist instead of the normal
  // confirmation flow (unless the caller opted out — see `waitlistOnOverflow`).
  let waitlisted = false;
  if (input.type === "porchetta" && waitlistOnOverflow) {
    const cap = await checkPorchettaCapacity(date, input.quantityKg ?? 0);
    waitlisted = cap.exceeded;
  }

  const [row] = await db
    .insert(reservations)
    .values({
      reference,
      type: input.type,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      date,
      time: input.time ?? null,
      guests: input.type === "table" ? (input.guests ?? null) : null,
      quantityKg: input.type === "porchetta" ? (input.quantityKg ?? null) : null,
      shopSlug: input.shop,
      notes: input.notes ?? null,
      status,
      waitlisted,
      userId: meta?.userId ?? null,
    })
    .returning({ id: reservations.id });

  const emailData: ReservationEmailData = {
    reference,
    type: input.type,
    name: input.name,
    phone: input.phone,
    email: input.email,
    date,
    time: input.time,
    guests: input.type === "table" ? input.guests : undefined,
    quantityKg: input.type === "porchetta" ? input.quantityKg : undefined,
    shopName,
    notes: input.notes,
  };

  // Owner notification + customer confirmation (if an email is known). A
  // waitlisted porchetta order gets the waitlist notice instead of the normal
  // "we received your request" confirmation.
  const jobs: Promise<unknown>[] = [];
  if (notifyOwner) {
    jobs.push(sendMail({ to: env.ownerEmail, ...reservationOwnerEmail(emailData) }));
  }
  if (notifyCustomer && input.email) {
    jobs.push(
      sendMail({
        to: input.email,
        ...(waitlisted
          ? porchettaWaitlistEmail(input.name, date, input.quantityKg)
          : reservationCustomerEmail(emailData)),
      }),
    );
  }
  await Promise.allSettled(jobs);

  return { reference, id: row.id };
}
