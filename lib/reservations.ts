import "server-only";
import { customAlphabet } from "nanoid";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations } from "@/lib/db/schema";
import { getShopBySlug, getShops, getSetting, getClosures } from "@/lib/db/queries";
import { closureFor, closureMessage } from "@/lib/closures";
import { dateInRome } from "@/lib/time";
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

// English weekday keys (as stored in the `porchetta.day` and
// `porchetta.cutoffDay` settings) → JS getDay().
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const WEEKDAY_IT: Record<string, string> = {
  sunday: "domenica",
  monday: "lunedì",
  tuesday: "martedì",
  wednesday: "mercoledì",
  thursday: "giovedì",
  friday: "venerdì",
  saturday: "sabato",
};

/** The same keys by JS `getDay()` index, for going the other way. */
const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** The weekday index a setting names; `fallback` when it names nothing. */
function weekdayIndex(key: unknown, fallback: number): number {
  return WEEKDAY_INDEX[String(key).toLowerCase()] ?? fallback;
}

/**
 * "sabato" for `"saturday"` — the settings store English keys, the site speaks
 * Italian. Lower-case, for the middle of a sentence.
 */
export function weekdayNameIt(key: unknown, fallback: string): string {
  return WEEKDAY_IT[String(key).toLowerCase()] ?? fallback;
}

/**
 * The last day a given porchetta pickup can still be ordered for.
 *
 * `porchettaPickupDays` derives the same deadline for the days it *offers*, so
 * the public page can grey out a batch that has closed. This is the other half:
 * the check at the write, which nothing performed — `porchetta.cutoffDay` was
 * editable, seeded, and read by no enforcement path, so a booking posted on
 * Saturday morning for the same day's roast was accepted for meat that went on
 * the fire the night before.
 *
 * Resolved backwards from the pickup date rather than forwards from today, so a
 * booking for a *later* week is judged against that week's deadline. A cut-off
 * on the pickup day itself means "up to the day", not "a week early".
 */
export async function porchettaCutoffFor(
  pickupIso: string,
): Promise<{ iso: string; label: string }> {
  const key = String(await getSetting<string>("porchetta.cutoffDay", "friday")).toLowerCase();
  const [y, m, d] = pickupIso.split("-").map(Number);
  const pickupWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const cutoffDay = WEEKDAY_INDEX[key];
  // An unrecognised setting must not silently invent a deadline: fall back to
  // the pickup day, which forbids nothing that was allowed before.
  if (cutoffDay == null) {
    return { iso: pickupIso, label: weekdayNameIt(WEEKDAY_KEYS[pickupWeekday], "") };
  }
  const back = (pickupWeekday - cutoffDay + 7) % 7;
  // UTC arithmetic to roll the calendar date, so a DST boundary can neither drop
  // nor duplicate a day.
  const iso = new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
  return { iso, label: weekdayNameIt(key, "") };
}

/**
 * `yyyy-mm-dd` of a Date read in the server's own frame — the frame the pickup
 * arithmetic here has always used, and the one the tests fix dates in.
 */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Sabato 26 luglio" — derived from the date, so it survives a changed setting. */
function dayLabel(d: Date, capitalise = true): string {
  const raw = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  return capitalise ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
}

/** The first `target` weekday on or after `now` — today, if today is one. */
function nextWeekday(now: Date, target: number): Date {
  const ahead = (target - now.getDay() + 7) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
}

/** One availability row per roasting shop, for one pickup day. */
async function shopAvailabilityFor(
  pickupIso: string,
  roasting: { slug: string; name: string }[],
): Promise<PorchettaShopAvailability[]> {
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
  return shops;
}

/** The two page-level verdicts, read off the per-shop rows. */
function summarise(shops: PorchettaShopAvailability[]): Pick<PorchettaAvailability, "hasCapacity" | "allFull"> {
  const capped = shops.filter((s) => s.capacityKg > 0);
  return {
    hasCapacity: capped.length > 0,
    allFull: capped.length > 0 && capped.every((s) => s.isFull),
  };
}

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
  const pickup = nextWeekday(now, weekdayIndex(dayKey, 6)); // fall back to Saturday
  const pickupIso = localIso(pickup);

  const roasting = (await getShops()).filter((s) => s.porchettaEnabled);
  const shops = await shopAvailabilityFor(pickupIso, roasting);

  return { pickupIso, pickupLabel: dayLabel(pickup), shops, ...summarise(shops) };
}

export type PorchettaPickupDay = PorchettaAvailability & {
  /** Last day (ISO) a booking for this pickup is taken online. */
  cutoffIso: string;
  /** "venerdì 25 luglio" — for the sentence that names the deadline. */
  cutoffLabel: string;
  /** False once the cutoff has passed: that batch is spoken for, or by phone only. */
  bookable: boolean;
};

/**
 * The next `count` pickup days, each with its per-shop availability and the
 * booking deadline that applies to it.
 *
 * The public page offers these as the days a customer can choose between, so
 * "prenota entro il venerdì" is a fact the page derives rather than a sentence
 * it asserts: the cutoff is `porchetta.cutoffDay`, read backwards from each
 * pickup, and a day whose cutoff has passed is still listed — greyed, with the
 * reason — rather than silently skipped, so a Saturday-morning visitor learns
 * why the batch they can smell is not the one they can book.
 */
export async function porchettaPickupDays(
  count = 4,
  now: Date = new Date(),
): Promise<PorchettaPickupDay[]> {
  const [dayKey, cutoffKey] = await Promise.all([
    getSetting<string>("porchetta.day", "saturday"),
    getSetting<string>("porchetta.cutoffDay", "friday"),
  ]);
  const pickupDay = weekdayIndex(dayKey, 6);
  const cutoffDay = weekdayIndex(cutoffKey, 5);
  // Days from the cutoff to the pickup. 0 = the same weekday, i.e. bookings
  // stay open on the pickup day itself.
  const lead = (pickupDay - cutoffDay + 7) % 7;
  const todayIso = localIso(now);

  const roasting = (await getShops()).filter((s) => s.porchettaEnabled);
  const first = nextWeekday(now, pickupDay);

  const days: PorchettaPickupDay[] = [];
  for (let i = 0; i < count; i++) {
    const pickup = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i * 7);
    const cutoff = new Date(pickup.getFullYear(), pickup.getMonth(), pickup.getDate() - lead);
    const pickupIso = localIso(pickup);
    const cutoffIso = localIso(cutoff);
    const shops = await shopAvailabilityFor(pickupIso, roasting);
    days.push({
      pickupIso,
      pickupLabel: dayLabel(pickup),
      shops,
      ...summarise(shops),
      cutoffIso,
      cutoffLabel: dayLabel(cutoff, false),
      bookable: todayIso <= cutoffIso,
    });
  }
  return days;
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
  /**
   * Refuse a booking that overbooks the room, is in the past, or falls on a
   * closed day. True for the public form, false for the back office — an
   * operator taking a booking on the phone is deciding to accept it, and gets
   * `capacityWarning()` instead. It is the same split the porchetta cap already
   * uses via `waitlistOnOverflow`.
   */
  enforceAvailability?: boolean;
};

/** ISO `yyyy-mm-dd`, and a real calendar date rather than "2026-02-31". */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
  );
}

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
    enforceAvailability = true,
  } = meta ?? {};
  const shop = await getShopBySlug(input.shop);
  if (!shop) {
    throw new ReservationNotAllowedError("Negozio non valido. Scegli una sede disponibile.");
  }
  if (!allowDisabledShop) {
    // The two master switches in Impostazioni. Both were editable and read by
    // nothing: only the per-shop columns below were ever consulted, so turning
    // "Prenotazioni attive" or "Porchetta del sabato" off changed precisely
    // nothing on the public site. A global switch that governs no behaviour is
    // worse than no switch, because somebody will trust it.
    if (input.type === "porchetta" && !(await getSetting<boolean>("porchetta.enabled", true))) {
      throw new ReservationNotAllowedError(
        "Le prenotazioni della porchetta sono sospese al momento.",
      );
    }
    if (!(await getSetting<boolean>("reservations.enabled", true))) {
      throw new ReservationNotAllowedError("Le prenotazioni sono sospese al momento.");
    }
    if (input.type === "porchetta" && !shop.porchettaEnabled) {
      throw new ReservationNotAllowedError("Questa sede non prepara la porchetta del sabato.");
    }
    if (input.type !== "porchetta" && !shop.reservationsEnabled) {
      throw new ReservationNotAllowedError("Questa sede non accetta prenotazioni al momento.");
    }
  }
  const shopName = shop.name;
  const reference = generateReference();
  const date = input.date ?? dateInRome();

  // The date column is documented as ISO and every reader keys on that — the
  // agenda, the calendar, the capacity sums, the cron sweeps. The admin schema
  // has always enforced the format; this endpoint took `z.string().optional()`,
  // so a direct POST could store "domani" in a row nothing could ever render.
  if (!isValidIsoDate(date)) {
    throw new ReservationNotAllowedError("Data non valida. Usa il calendario per sceglierla.");
  }

  if (enforceAvailability) {
    // A booking for a day already gone is never a real intention — it is a
    // stale tab, a clock skew, or someone poking the endpoint.
    if (date < dateInRome()) {
      throw new ReservationNotAllowedError("Quella data è già passata. Scegline un'altra.");
    }

    // Closed days. The weekly schedule cannot express them, so without this the
    // form happily books Ferragosto.
    const closure = closureFor(await getClosures(), input.shop, date, "reservations");
    if (closure) throw new ReservationNotAllowedError(closureMessage(closure, date));

    // The ordering deadline for that week's roast. `porchettaPickupDays` greys
    // out a closed batch on the public page; this is the check at the write, so
    // a direct POST — or a tab left open past Friday — cannot slip in behind it.
    if (input.type === "porchetta") {
      const cutoff = await porchettaCutoffFor(date);
      if (dateInRome() > cutoff.iso) {
        throw new ReservationNotAllowedError(
          `Le prenotazioni per il ${date} si chiudevano ${cutoff.label} ${cutoff.iso}. Scegli il ritiro successivo.`,
        );
      }
    }

    // Seats. The kilos of porchetta have been capped since the beginning and
    // the room never was, so the one thing the shop actually runs on a
    // calendar — Saturday dinner — could be double-booked from the website
    // without a word. The back office still only warns (see `capacityWarning`).
    if (input.type === "table") {
      const seats = await checkSeatsCapacity(input.shop, date, input.time, input.guests);
      if (seats.exceeded) {
        const free = Math.max(0, seats.capacity - seats.booked);
        throw new ReservationNotAllowedError(
          free > 0
            ? `Per le ${input.time} ${free === 1 ? "resta 1 coperto" : `restano ${free} coperti`}. Scegli un altro orario o riduci gli ospiti.`
            : `Le ${input.time} sono al completo. Scegli un altro orario — o chiamaci, troviamo una soluzione.`,
        );
      }
    }
  }

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
