import "server-only";
import { customAlphabet } from "nanoid";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema";
import { getShopBySlug, getShops, getSetting } from "@/lib/db/queries";
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
/**
 * The kg cap that applies to one location on one pickup day.
 *
 * A shop's own `porchettaCapacityKg` wins; otherwise the shop-wide setting. The
 * two shops prepare separately, so a single shared number was wrong for both —
 * and it double-counted, since the check sums every booking regardless of where
 * it will be collected.
 */
export async function porchettaCapacityFor(shopSlug: string | null | undefined): Promise<number> {
  // The setting was named `weeklyCapacityKg` but has always been applied per
  // pickup day. Reading the new key first and falling back keeps existing
  // installs working without a data migration.
  //
  // The sentinel matters: `getSetting` cannot tell "absent" from "0", and 0 is a
  // meaningful value here (no limit). Falling back on a falsy 0 meant an admin
  // who deliberately set the new key to "no limit" would silently inherit a
  // stale legacy cap instead.
  const perDay = await getSetting<number | null>("porchetta.capacityKgPerDay", null);
  const configured = perDay ?? (await getSetting<number>("porchetta.weeklyCapacityKg", 0));
  const fallback = Number(configured) || 0;
  if (!shopSlug) return fallback;
  const shop = await getShopBySlug(shopSlug);
  return shop?.porchettaCapacityKg ?? fallback;
}

export type PorchettaShopAvailability = {
  slug: string;
  name: string;
  /** Cap in force for this shop on the pickup day; 0 = no limit configured. */
  capacityKg: number;
  bookedKg: number;
  remainingKg: number;
  isFull: boolean;
};

export type PorchettaAvailability = {
  /** The next pickup day, ISO yyyy-mm-dd. */
  pickupIso: string;
  /** "Sabato 26 luglio" — derived from the date, so it survives a changed setting. */
  pickupLabel: string;
  /** One row per shop that actually roasts. Empty when porchetta is off everywhere. */
  shops: PorchettaShopAvailability[];
  /** True when every roasting shop is full (or there are none). */
  allFull: boolean;
  /** True when at least one shop publishes a cap worth showing. */
  hasCapacity: boolean;
};

// English weekday keys (as stored in the `porchetta.day` setting) → JS getDay().
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Live availability for the next porchetta pickup day, **per shop**.
 *
 * The public page used to compare one shared setting against
 * `getPorchettaKgForDate()`, which sums *every* location — so with two shops it
 * measured a two-shop total against a one-shop cap. It could say "al completo"
 * while a shop still had room, or offer kilos for a shop that was already full
 * and then refuse the booking at submit. Enforcement
 * (`checkPorchettaCapacity`) has always been per location; this makes the
 * display agree with it.
 *
 * `now` is a parameter so the date arithmetic stays out of a component's render
 * body (the React Compiler lint forbids `new Date()` there).
 */
export async function porchettaAvailability(now: Date = new Date()): Promise<PorchettaAvailability> {
  const dayKey = await getSetting<string>("porchetta.day", "saturday");
  const target = WEEKDAY_INDEX[String(dayKey).toLowerCase()] ?? 6; // fall back to Saturday
  const ahead = (target - now.getDay() + 7) % 7; // 0 = today is the pickup day
  const pickup = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
  const pickupIso = `${pickup.getFullYear()}-${String(pickup.getMonth() + 1).padStart(2, "0")}-${String(pickup.getDate()).padStart(2, "0")}`;

  const raw = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(pickup);
  const pickupLabel = raw.charAt(0).toUpperCase() + raw.slice(1);

  const allShops = await getShops();
  const roasting = allShops.filter((s) => s.porchettaEnabled);

  const shops: PorchettaShopAvailability[] = [];
  for (const s of roasting) {
    // Reuse the enforcement path rather than re-deriving it — a second copy of
    // this arithmetic is exactly how the two drifted apart in the first place.
    const { capacityKg, bookedKg } = await checkPorchettaCapacity(pickupIso, 0, {
      shopSlug: s.slug,
    });
    const remainingKg = Math.max(0, capacityKg - bookedKg);
    shops.push({
      slug: s.slug,
      name: s.name,
      capacityKg,
      bookedKg,
      remainingKg,
      isFull: capacityKg > 0 && remainingKg <= 0,
    });
  }

  const capped = shops.filter((s) => s.capacityKg > 0);
  return {
    pickupIso,
    pickupLabel,
    shops,
    hasCapacity: capped.length > 0,
    allFull: capped.length > 0 && capped.every((s) => s.isFull),
  };
}

/** Guests already booked in one time slot (excluding cancellations). */
export function seatsBookedInSlot(
  rows: { time: string | null; guests: number | null; status: string }[],
  time: string,
): number {
  return rows
    .filter((r) => r.time === time && r.status !== "cancelled")
    .reduce((s, r) => s + (r.guests ?? 0), 0);
}

export async function checkPorchettaCapacity(
  date: string,
  requestedKg: number,
  opts: { excludeId?: string; shopSlug?: string | null } = {},
): Promise<PorchettaCapacity> {
  const capacityKg = await porchettaCapacityFor(opts.shopSlug);
  if (capacityKg <= 0) return { capacityKg: 0, bookedKg: 0, exceeded: false };

  const conds = [
    eq(reservations.type, "porchetta"),
    eq(reservations.date, date),
    ne(reservations.status, "cancelled"),
  ];
  // Scope to the location when one is known: each shop roasts its own.
  if (opts.shopSlug) conds.push(eq(reservations.shopSlug, opts.shopSlug));
  if (opts.excludeId) conds.push(ne(reservations.id, opts.excludeId));

  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${reservations.quantityKg}), 0)` })
    .from(reservations)
    .where(and(...conds));

  const bookedKg = Number(total);
  return { capacityKg, bookedKg, exceeded: bookedKg + requestedKg > capacityKg };
}

export type SeatsCapacity = {
  /** Seats bookable in one slot at this shop; 0 = no limit configured. */
  capacity: number;
  /** Guests already booked in that slot. */
  booked: number;
  exceeded: boolean;
};

/**
 * Whether seating a party of `guests` at `time` overbooks the room.
 *
 * Porchetta kilos were capped but seats never were, so double-booking Saturday
 * dinner — the one thing the shop actually runs on a calendar — was
 * unpreventable. Like the kg check this warns rather than blocks in the back
 * office: an operator taking a booking is making a decision.
 */
export async function checkSeatsCapacity(
  shopSlug: string,
  date: string,
  time: string | null | undefined,
  guests: number | null | undefined,
  opts: { excludeId?: string } = {},
): Promise<SeatsCapacity> {
  const shop = await getShopBySlug(shopSlug);
  const capacity = shop?.seatsCapacity ?? 0;
  if (!time || !guests || capacity <= 0) return { capacity: 0, booked: 0, exceeded: false };

  const conds = [
    eq(reservations.shopSlug, shopSlug),
    eq(reservations.date, date),
    eq(reservations.time, time),
    ne(reservations.status, "cancelled"),
  ];
  if (opts.excludeId) conds.push(ne(reservations.id, opts.excludeId));

  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${reservations.guests}), 0)` })
    .from(reservations)
    .where(and(...conds));

  const booked = Number(total);
  return { capacity, booked, exceeded: booked + guests > capacity };
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
  //
  // The cap is read first because settings live behind an async accessor; the
  // *decision* then happens inside the same transaction as the insert. Splitting
  // "sum the day's kg" from "insert this booking" into two statements let two
  // concurrent pre-orders both read an under-cap total and both confirm, selling
  // more porchetta than the Saturday can produce. better-sqlite3 executes the
  // transaction synchronously, so no other booking can interleave between the
  // read and the write.
  const capacityKg =
    input.type === "porchetta" && waitlistOnOverflow ? await porchettaCapacityFor(input.shop) : 0;
  const requestedKg = input.quantityKg ?? 0;

  const { id: insertedId, waitlisted } = await db.transaction(async (tx) => {
    let overflow = false;
    if (capacityKg > 0) {
      const [booked] = await tx
        .select({ total: sql<number>`coalesce(sum(${reservations.quantityKg}), 0)` })
        .from(reservations)
        .where(
          and(
            eq(reservations.type, "porchetta"),
            eq(reservations.date, date),
            // Per location: each shop roasts its own, so one shop's bookings
            // must not consume the other's capacity.
            eq(reservations.shopSlug, input.shop),
            // A cancelled booking frees its kg back up; a no-show does not — the
            // porchetta was already prepared for it.
            ne(reservations.status, "cancelled"),
          ),
        )
;
      overflow = Number(booked?.total ?? 0) + requestedKg > capacityKg;
    }

    const [inserted] = await tx
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
        waitlisted: overflow,
        userId: meta?.userId ?? null,
      })
      .returning({ id: reservations.id })
;

    return { id: inserted.id, waitlisted: overflow };
  });

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

  return { reference, id: insertedId };
}
