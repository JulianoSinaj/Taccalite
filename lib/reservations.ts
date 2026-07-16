import "server-only";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema";
import { getShopBySlug } from "@/lib/db/queries";
import { sendMail } from "@/lib/mail/mailer";
import { reservationCustomerEmail, reservationOwnerEmail, type ReservationEmailData } from "@/lib/mail/templates";
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
  const shopName = shop?.name ?? input.shop;
  const reference = generateReference();

  const [row] = await db
    .insert(reservations)
    .values({
      reference,
      type: input.type,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      time: input.time ?? null,
      guests: input.type === "table" ? (input.guests ?? null) : null,
      quantityKg: input.type === "porchetta" ? (input.quantityKg ?? null) : null,
      shopSlug: input.shop,
      notes: input.notes ?? null,
      status: "pending",
      userId: meta?.userId ?? null,
    })
    .returning({ id: reservations.id });

  const emailData: ReservationEmailData = {
    reference,
    type: input.type,
    name: input.name,
    phone: input.phone,
    email: input.email,
    date: input.date ?? new Date().toISOString().slice(0, 10),
    time: input.time,
    guests: input.type === "table" ? input.guests : undefined,
    quantityKg: input.type === "porchetta" ? input.quantityKg : undefined,
    shopName,
    notes: input.notes,
  };

  // Owner notification (always) + customer confirmation (if email given).
  const jobs: Promise<unknown>[] = [
    sendMail({ to: env.ownerEmail, ...reservationOwnerEmail(emailData) }),
  ];
  if (input.email) {
    jobs.push(sendMail({ to: input.email, ...reservationCustomerEmail(emailData) }));
  }
  await Promise.allSettled(jobs);

  return { reference, id: row.id };
}
