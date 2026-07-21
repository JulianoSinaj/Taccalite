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

/**
 * Persist a reservation and fire the notification + confirmation emails.
 * Email failures never fail the reservation (it's already saved); they are
 * recorded in the outbox.
 */
export async function createReservation(
  input: ReservationInput,
  meta?: { userId?: string },
): Promise<CreateReservationResult> {
  const shop = await getShopBySlug(input.shop);
  if (!shop) {
    throw new ReservationNotAllowedError("Negozio non valido. Scegli una sede disponibile.");
  }
  if (input.type === "porchetta" && !shop.porchettaEnabled) {
    throw new ReservationNotAllowedError("Questa sede non prepara la porchetta del sabato.");
  }
  if (input.type !== "porchetta" && !shop.reservationsEnabled) {
    throw new ReservationNotAllowedError("Questa sede non accetta prenotazioni al momento.");
  }
  const shopName = shop.name;
  const reference = generateReference();
  const date = input.date ?? new Date().toISOString().slice(0, 10);

  // Porchetta capacity check: if a weekly cap is configured, sum the kg already
  // booked (non-cancelled) for the same date; when this order would push the day
  // over the cap it goes on the waitlist instead of the normal confirmation flow.
  let waitlisted = false;
  if (input.type === "porchetta") {
    const capacityKg = await getSetting<number>("porchetta.weeklyCapacityKg", 0);
    if (capacityKg > 0) {
      const [{ total }] = await db
        .select({ total: sql<number>`coalesce(sum(${reservations.quantityKg}), 0)` })
        .from(reservations)
        .where(
          and(
            eq(reservations.type, "porchetta"),
            eq(reservations.date, date),
            ne(reservations.status, "cancelled"),
          ),
        );
      const requested = input.quantityKg ?? 0;
      if (Number(total) + requested > capacityKg) waitlisted = true;
    }
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
      status: "pending",
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

  // Owner notification (always) + customer confirmation (if email given). A
  // waitlisted porchetta order gets the waitlist notice instead of the normal
  // "we received your request" confirmation.
  const jobs: Promise<unknown>[] = [
    sendMail({ to: env.ownerEmail, ...reservationOwnerEmail(emailData) }),
  ];
  if (input.email) {
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
