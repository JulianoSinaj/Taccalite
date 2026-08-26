import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, reservations, settings } from "@/lib/db/schema";
import {
  createReservation,
  checkPorchettaCapacity,
  checkSeatsCapacity,
  porchettaCapacityFor,
  porchettaAvailability,
} from "@/lib/reservations";
import { filterQuery } from "@/lib/admin/filters";
import { getReservationsPage, getDepositsAwaitingOutcome, getHeldDeposits } from "@/lib/admin/queries";
import { runReservationAutoClose } from "@/lib/automation";
import { reservationCreateInput } from "@/lib/validation/admin";

const SHOP = "cap-shop";
const DATE = "2026-09-05"; // a Saturday, well clear of other fixtures

/** Writes the *legacy* key, so these tests keep covering the fallback path that
 *  installs seeded before the rename still rely on. */
async function setCapacity(kg: number) {
  await setSetting("porchetta.weeklyCapacityKg", kg);
}

async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

async function clearSetting(key: string) {
  await db.delete(settings).where(eq(settings.key, key));
}

beforeAll(async () => {
  await db
    .insert(shops)
    .values({
      slug: SHOP,
      name: "Capacità",
      specialty: "Porchetta",
      porchettaEnabled: true,
      reservationsEnabled: false, // exercises the back-office override
    })
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  await db.delete(reservations).where(eq(reservations.shopSlug, SHOP));
  await setCapacity(0);
});

describe("checkPorchettaCapacity", () => {
  it("reports no limit when the weekly cap is unset", async () => {
    const cap = await checkPorchettaCapacity(DATE, 999);
    expect(cap).toEqual({ capacityKg: 0, bookedKg: 0, exceeded: false });
  });

  it("sums non-cancelled kg for the day and flags an overflow", async () => {
    await setCapacity(10);
    await db.insert(reservations).values([
      { reference: "CAP-1", type: "porchetta", name: "A", phone: "1", date: DATE, quantityKg: 6, shopSlug: SHOP },
      // Cancelled bookings free their kg back up.
      { reference: "CAP-2", type: "porchetta", name: "B", phone: "2", date: DATE, quantityKg: 8, shopSlug: SHOP, status: "cancelled" },
    ]);

    const fits = await checkPorchettaCapacity(DATE, 4);
    expect(fits.bookedKg).toBe(6);
    expect(fits.exceeded).toBe(false);

    const overflows = await checkPorchettaCapacity(DATE, 5);
    expect(overflows.exceeded).toBe(true);
  });

  it("still counts a no-show against the day — the porchetta was made anyway", async () => {
    await setCapacity(10);
    await db.insert(reservations).values({
      reference: "CAP-NS",
      type: "porchetta",
      name: "Assente",
      phone: "9",
      date: DATE,
      quantityKg: 7,
      shopSlug: SHOP,
      status: "no_show",
    });

    // Unlike a cancellation, a no-show consumed the day's production: the shop
    // roasted that porchetta and nobody came for it.
    const cap = await checkPorchettaCapacity(DATE, 4);
    expect(cap.bookedKg).toBe(7);
    expect(cap.exceeded).toBe(true);
  });

  it("excludes the reservation being rescheduled from its own day's total", async () => {
    await setCapacity(10);
    const [row] = await db
      .insert(reservations)
      .values({ reference: "CAP-3", type: "porchetta", name: "C", phone: "3", date: DATE, quantityKg: 9, shopSlug: SHOP })
      .returning({ id: reservations.id });

    // Re-checking that same booking at 9 kg must not count its existing 9 kg twice.
    const self = await checkPorchettaCapacity(DATE, 9, { excludeId: row.id });
    expect(self.bookedKg).toBe(0);
    expect(self.exceeded).toBe(false);

    const other = await checkPorchettaCapacity(DATE, 9);
    expect(other.exceeded).toBe(true);
  });
});

describe("createReservation — back-office options", () => {
  it("books a confirmed reservation past a full day when waitlisting is off", async () => {
    await setCapacity(5);
    await db.insert(reservations).values({
      reference: "CAP-4", type: "porchetta", name: "D", phone: "4", date: DATE, quantityKg: 5, shopSlug: SHOP,
    });

    const created = await createReservation(
      { type: "porchetta", name: "Banco", phone: "555", email: undefined, shop: SHOP, date: DATE, quantityKg: 3 },
      { status: "confirmed", notifyOwner: false, notifyCustomer: false, waitlistOnOverflow: false, allowDisabledShop: true },
    );

    const [row] = await db.select().from(reservations).where(eq(reservations.id, created.id));
    expect(row.status).toBe("confirmed");
    expect(row.waitlisted).toBe(false);
  });

  it("still waitlists an overflowing public booking", async () => {
    await setCapacity(5);
    await db.insert(reservations).values({
      reference: "CAP-5", type: "porchetta", name: "E", phone: "5", date: DATE, quantityKg: 5, shopSlug: SHOP,
    });

    const created = await createReservation({
      type: "porchetta", name: "Web", phone: "666", email: undefined, shop: SHOP, date: DATE, quantityKg: 3,
    });

    const [row] = await db.select().from(reservations).where(eq(reservations.id, created.id));
    expect(row.waitlisted).toBe(true);
    expect(row.status).toBe("pending");
  });

  it("refuses a shop that has bookings disabled unless the caller overrides", async () => {
    await expect(
      createReservation({ type: "table", name: "Web", phone: "777", email: undefined, shop: SHOP, date: DATE, guests: 2 }),
    ).rejects.toThrow(/non accetta prenotazioni/i);

    const created = await createReservation(
      { type: "table", name: "Telefono", phone: "888", email: undefined, shop: SHOP, date: DATE, guests: 2 },
      { notifyOwner: false, notifyCustomer: false, allowDisabledShop: true },
    );
    expect(created.reference).toMatch(/^TAC-/);
  });
});

describe("filterQuery", () => {
  it("drops catch-all and empty facets", () => {
    expect(filterQuery({ negozio: "all", stato: "all", q: undefined })).toBe("");
  });

  it("renders only the active facets", () => {
    expect(filterQuery({ negozio: "centro", stato: "to-fulfil", tipo: "all", q: "rossi" })).toBe(
      "?negozio=centro&stato=to-fulfil&q=rossi",
    );
  });
});

describe("per-shop porchetta capacity", () => {
  const SHOP_B = "capacity-shop-b";

  beforeAll(async () => {
    await db
      .insert(shops)
      .values({ slug: SHOP_B, name: "Seconda sede", specialty: "test", porchettaCapacityKg: 3 })
      .onConflictDoUpdate({ target: shops.slug, set: { porchettaCapacityKg: 3 } });
  });

  it("uses the shop's own cap in preference to the shop-wide setting", async () => {
    await setCapacity(50);
    // The second shop overrides the generous global figure with 3 kg.
    expect(await porchettaCapacityFor(SHOP_B)).toBe(3);
    expect(await porchettaCapacityFor(SHOP)).toBe(50);
  });

  it("prefers the current key over the superseded one, including an explicit 0", async () => {
    // The old resolution was `perDay || legacy`, so setting the canonical key to
    // 0 ("no limit") fell through to whatever the legacy key still held. The
    // settings page now writes the canonical key, which made that reachable.
    await setCapacity(50); // legacy key
    await setSetting("porchetta.capacityKgPerDay", 12);
    expect(await porchettaCapacityFor(SHOP)).toBe(12);

    await setSetting("porchetta.capacityKgPerDay", 0);
    expect(await porchettaCapacityFor(SHOP)).toBe(0);

    // Absent (not zero) is what falls back to the legacy key.
    await clearSetting("porchetta.capacityKgPerDay");
    expect(await porchettaCapacityFor(SHOP)).toBe(50);
  });

  it("does not let one shop's bookings consume another's capacity", async () => {
    await setCapacity(50);
    await db.insert(reservations).values({
      reference: `TAC-CAPB${Date.now()}`,
      type: "porchetta",
      name: "Cliente B",
      phone: "333",
      date: DATE,
      quantityKg: 3,
      shopSlug: SHOP_B,
      status: "confirmed",
    });

    // Shop B is now full at its own 3 kg cap…
    const atB = await checkPorchettaCapacity(DATE, 1, { shopSlug: SHOP_B });
    expect(atB.capacityKg).toBe(3);
    expect(atB.bookedKg).toBe(3);
    expect(atB.exceeded).toBe(true);

    // …while the other shop is unaffected by it.
    const atA = await checkPorchettaCapacity(DATE, 1, { shopSlug: SHOP });
    expect(atA.bookedKg).toBe(0);
    expect(atA.exceeded).toBe(false);
  });
});

describe("porchettaAvailability (public page)", () => {
  const AV_A = "avail-shop-a";
  const AV_B = "avail-shop-b";
  // A Saturday. `porchetta.day` defaults to saturday, so asking on the Thursday
  // before resolves to this date.
  const SAT = "2026-10-03";
  const THURSDAY_BEFORE = new Date(2026, 9, 1, 12, 0, 0);

  beforeAll(async () => {
    for (const [slug, name, cap] of [
      [AV_A, "Sede A", 10],
      [AV_B, "Sede B", 4],
    ] as const) {
      await db
        .insert(shops)
        .values({ slug, name, specialty: "porchetta", porchettaEnabled: true, porchettaCapacityKg: cap })
        .onConflictDoUpdate({ target: shops.slug, set: { porchettaCapacityKg: cap, porchettaEnabled: true } });
    }
  });

  it("resolves the next pickup day and reports each shop separately", async () => {
    const av = await porchettaAvailability(THURSDAY_BEFORE);
    expect(av.pickupIso).toBe(SAT);
    expect(av.pickupLabel.toLowerCase()).toContain("sabato");

    const a = av.shops.find((s) => s.slug === AV_A);
    const b = av.shops.find((s) => s.slug === AV_B);
    expect(a?.capacityKg).toBe(10);
    expect(b?.capacityKg).toBe(4);
  });

  it("does not let one shop's bookings eat into another's remaining kg", async () => {
    await db.delete(reservations).where(eq(reservations.shopSlug, AV_A));
    await db.delete(reservations).where(eq(reservations.shopSlug, AV_B));
    // 4 kg at shop B fills it exactly. The old page summed every location against
    // one shared cap, so this booking also ate shop A's availability.
    await db.insert(reservations).values({
      reference: "TAC-AVB1",
      type: "porchetta",
      name: "Cliente",
      phone: "1",
      date: SAT,
      quantityKg: 4,
      shopSlug: AV_B,
      status: "confirmed",
    });

    const av = await porchettaAvailability(THURSDAY_BEFORE);
    const a = av.shops.find((s) => s.slug === AV_A)!;
    const b = av.shops.find((s) => s.slug === AV_B)!;

    expect(b.remainingKg).toBe(0);
    expect(b.isFull).toBe(true);
    expect(a.remainingKg).toBe(10); // untouched
    expect(a.isFull).toBe(false);
    // One shop full is not "al completo" — the strip must still invite a booking.
    expect(av.allFull).toBe(false);
    expect(av.hasCapacity).toBe(true);
  });

  it("omits shops that don't roast", async () => {
    await db.update(shops).set({ porchettaEnabled: false }).where(eq(shops.slug, AV_A));
    const av = await porchettaAvailability(THURSDAY_BEFORE);
    expect(av.shops.some((s) => s.slug === AV_A)).toBe(false);
    await db.update(shops).set({ porchettaEnabled: true }).where(eq(shops.slug, AV_A));
  });
});

describe("checkSeatsCapacity", () => {
  const SEATED = "seats-shop";
  const DAY = "2031-09-20";

  beforeAll(async () => {
    await db
      .insert(shops)
      .values({ slug: SEATED, name: "Sala", specialty: "test", seatsCapacity: 10 })
      .onConflictDoUpdate({ target: shops.slug, set: { seatsCapacity: 10 } });
    await db.insert(reservations).values([
      {
        reference: `TAC-S1${Date.now()}`,
        type: "table",
        name: "Tavolo 1",
        phone: "1",
        date: DAY,
        time: "20:00",
        guests: 6,
        shopSlug: SEATED,
        status: "confirmed",
      },
      {
        reference: `TAC-S2${Date.now()}`,
        type: "table",
        name: "Annullato",
        phone: "2",
        date: DAY,
        time: "20:00",
        guests: 8,
        shopSlug: SEATED,
        status: "cancelled",
      },
    ]);
  });

  it("counts only live bookings in the same slot", async () => {
    const c = await checkSeatsCapacity(SEATED, DAY, "20:00", 2);
    expect(c.capacity).toBe(10);
    expect(c.booked).toBe(6); // the cancelled party of 8 doesn't count
    expect(c.exceeded).toBe(false);
  });

  it("flags a party that overbooks the slot", async () => {
    const c = await checkSeatsCapacity(SEATED, DAY, "20:00", 5);
    expect(c.exceeded).toBe(true);
  });

  it("treats a different slot as independent", async () => {
    const c = await checkSeatsCapacity(SEATED, DAY, "13:00", 9);
    expect(c.booked).toBe(0);
    expect(c.exceeded).toBe(false);
  });

  it("says nothing when the shop has no seat limit configured", async () => {
    const c = await checkSeatsCapacity(SHOP, DAY, "20:00", 500);
    expect(c).toEqual({ capacity: 0, booked: 0, exceeded: false });
  });

  it("ignores a booking with no time or no party size", async () => {
    expect(await checkSeatsCapacity(SEATED, DAY, null, 4)).toMatchObject({ exceeded: false });
    expect(await checkSeatsCapacity(SEATED, DAY, "20:00", null)).toMatchObject({ exceeded: false });
  });
});

describe("reservationCreateInput (back office)", () => {
  const base = { name: "Mario", phone: "3331234567", shopSlug: SHOP, date: DATE };

  it("requires a description for an ordine speciale, as the public form does", () => {
    expect(reservationCreateInput.safeParse({ ...base, type: "order" }).success).toBe(false);
    expect(reservationCreateInput.safeParse({ ...base, type: "order", notes: "2 kg di ciauscolo" }).success).toBe(true);
  });

  it("still lets a table booking through without notes", () => {
    expect(reservationCreateInput.safeParse({ ...base, type: "table", guests: "4" }).success).toBe(true);
  });
});

describe("expired bookings", () => {
  const past = "2020-01-10";
  const seed = (status: "pending" | "confirmed" | "completed", date: string, extra: Record<string, unknown> = {}) =>
    db.insert(reservations).values({
      reference: `X-${Math.random().toString(36).slice(2, 8)}`,
      type: "table",
      name: "Past",
      phone: "1",
      date,
      time: "20:00",
      guests: 2,
      shopSlug: SHOP,
      status,
      ...extra,
    });

  it("the autoclose job completes past confirmed bookings and nothing else", async () => {
    await seed("confirmed", past);
    await seed("pending", past);
    await seed("confirmed", DATE); // future — must stay

    const { closed } = await runReservationAutoClose(new Date("2026-08-26T09:00:00Z"));
    expect(closed).toBe(1);

    const rows = await db.select().from(reservations).where(eq(reservations.shopSlug, SHOP));
    const byDate = (d: string, st: string) => rows.filter((r) => r.date === d && r.status === st).length;
    expect(byDate(past, "completed")).toBe(1);
    expect(byDate(past, "pending")).toBe(1);
    expect(byDate(DATE, "confirmed")).toBe(1);
  });

  it("the «scadute» facet lists open bookings whose day has passed", async () => {
    await seed("pending", past);
    await seed("confirmed", past);
    await seed("completed", past);
    await seed("confirmed", DATE);

    const { rows } = await getReservationsPage({ stato: "scadute", negozio: SHOP });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.date === past)).toBe(true);
  });
});

describe("deposits on cancelled bookings", () => {
  it("a paid deposit on a cancelled booking is neither held nor forgotten until decided", async () => {
    const paid = new Date("2026-08-01T10:00:00Z");
    await db.insert(reservations).values([
      {
        reference: "DEP-LIVE",
        type: "table",
        name: "A",
        phone: "1",
        date: DATE,
        shopSlug: SHOP,
        status: "confirmed",
        depositCents: 2000,
        depositPaidAt: paid,
      },
      {
        reference: "DEP-CANC",
        type: "table",
        name: "B",
        phone: "1",
        date: DATE,
        shopSlug: SHOP,
        status: "cancelled",
        depositCents: 3000,
        depositPaidAt: paid,
      },
      {
        reference: "DEP-REF",
        type: "table",
        name: "C",
        phone: "1",
        date: DATE,
        shopSlug: SHOP,
        status: "cancelled",
        depositCents: 5000,
        depositPaidAt: paid,
        depositRefundedAt: paid,
      },
    ]);

    const held = await getHeldDeposits(SHOP);
    expect(held).toEqual({ cents: 2000, count: 1 });

    const awaiting = await getDepositsAwaitingOutcome(SHOP);
    expect(awaiting).toEqual({ cents: 3000, count: 1 });
  });
});
