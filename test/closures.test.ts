import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, reservations, shopClosures } from "@/lib/db/schema";
import { createReservation, ReservationNotAllowedError } from "@/lib/reservations";
import { closureFor, isClosed, closedDatesBetween, type ClosureLike } from "@/lib/closures";
import { pickupSlotOptions, type SlotLike } from "@/lib/pickup-slots";
import { dateInRome } from "@/lib/time";

const SHOP = "clo-shop";
const OTHER = "clo-other";

/** A date far enough ahead that no other fixture books against it. */
const FUTURE = "2027-08-15";

beforeAll(async () => {
  for (const [slug, name] of [
    [SHOP, "Chiusure"],
    [OTHER, "Altra sede"],
  ]) {
    await db
      .insert(shops)
      .values({ slug, name, specialty: "test", seatsCapacity: 10 })
      .onConflictDoNothing({ target: shops.slug });
  }
});

beforeEach(async () => {
  await db.delete(shopClosures).where(eq(shopClosures.shopSlug, SHOP));
  await db.delete(shopClosures).where(eq(shopClosures.shopSlug, OTHER));
  await db.delete(reservations).where(eq(reservations.shopSlug, SHOP));
});

const closure = (over: Partial<ClosureLike> = {}): ClosureLike => ({
  shopSlug: SHOP,
  fromDate: FUTURE,
  toDate: FUTURE,
  reason: "",
  blocksReservations: true,
  blocksPickup: true,
  ...over,
});

describe("closureFor — which days are covered", () => {
  it("matches a single day and neither of its neighbours", () => {
    const cs = [closure()];
    expect(closureFor(cs, SHOP, FUTURE, "reservations")).not.toBeNull();
    expect(closureFor(cs, SHOP, "2027-08-14", "reservations")).toBeNull();
    expect(closureFor(cs, SHOP, "2027-08-16", "reservations")).toBeNull();
  });

  it("matches every day of a range, inclusive of both ends", () => {
    const cs = [closure({ fromDate: "2027-08-10", toDate: "2027-08-20" })];
    for (const d of ["2027-08-10", "2027-08-15", "2027-08-20"]) {
      expect(isClosed(cs, SHOP, d, "reservations")).toBe(true);
    }
    expect(isClosed(cs, SHOP, "2027-08-09", "reservations")).toBe(false);
    expect(isClosed(cs, SHOP, "2027-08-21", "reservations")).toBe(false);
  });

  it("a null shopSlug closes every location; a set one closes only that shop", () => {
    const everywhere = [closure({ shopSlug: null })];
    expect(isClosed(everywhere, SHOP, FUTURE, "reservations")).toBe(true);
    expect(isClosed(everywhere, OTHER, FUTURE, "reservations")).toBe(true);

    const justOne = [closure({ shopSlug: SHOP })];
    expect(isClosed(justOne, SHOP, FUTURE, "reservations")).toBe(true);
    expect(isClosed(justOne, OTHER, FUTURE, "reservations")).toBe(false);
  });

  it("the two flags are independent — a refit can stop bookings but not pickups", () => {
    const cs = [closure({ blocksReservations: true, blocksPickup: false })];
    expect(isClosed(cs, SHOP, FUTURE, "reservations")).toBe(true);
    expect(isClosed(cs, SHOP, FUTURE, "pickup")).toBe(false);
  });

  it("expands a range to its dates, clamped to the window asked for", () => {
    const cs = [closure({ fromDate: "2027-08-10", toDate: "2027-08-20" })];
    const days = closedDatesBetween(cs, SHOP, "2027-08-18", "2027-08-25", "reservations");
    expect(days).toEqual(["2027-08-18", "2027-08-19", "2027-08-20"]);
  });

  it("de-duplicates days covered by two overlapping closures", () => {
    const cs = [
      closure({ fromDate: "2027-08-10", toDate: "2027-08-12" }),
      closure({ shopSlug: null, fromDate: "2027-08-11", toDate: "2027-08-13" }),
    ];
    expect(closedDatesBetween(cs, SHOP, "2027-08-01", "2027-08-31", "reservations")).toEqual([
      "2027-08-10",
      "2027-08-11",
      "2027-08-12",
      "2027-08-13",
    ]);
  });
});

describe("pickupSlotOptions — closed days offer no window", () => {
  const slot = (weekday: number): SlotLike => ({
    id: `s-${weekday}`,
    shopSlug: SHOP,
    weekday,
    startTime: "10:00",
    endTime: "12:00",
    capacityOrders: null,
    cutoffHours: 0,
    active: true,
  });

  it("drops the windows falling inside a closure and keeps the rest", () => {
    // A fixed "now" so the 14-day horizon is deterministic.
    const now = new Date("2027-08-09T06:00:00Z"); // Monday
    const everyWeekday = [1, 2, 3, 4, 5, 6, 7].map(slot);

    const open = pickupSlotOptions(everyWeekday, { now, days: 14 });
    expect(open.some((o) => o.date === "2027-08-12")).toBe(true);

    const withClosure = pickupSlotOptions(everyWeekday, {
      now,
      days: 14,
      closures: [closure({ fromDate: "2027-08-12", toDate: "2027-08-14" })],
    });
    for (const d of ["2027-08-12", "2027-08-13", "2027-08-14"]) {
      expect(withClosure.some((o) => o.date === d)).toBe(false);
    }
    // The days either side are untouched — the whole point of a date-scoped
    // closure over the global on/off switch.
    expect(withClosure.some((o) => o.date === "2027-08-11")).toBe(true);
    expect(withClosure.some((o) => o.date === "2027-08-15")).toBe(true);
  });

  it("ignores a closure that only blocks reservations", () => {
    const now = new Date("2027-08-09T06:00:00Z");
    const options = pickupSlotOptions([slot(4)], {
      now,
      days: 14,
      closures: [closure({ fromDate: "2027-08-12", toDate: "2027-08-12", blocksPickup: false })],
    });
    expect(options.some((o) => o.date === "2027-08-12")).toBe(true);
  });
});

describe("createReservation — the public gate", () => {
  const base = {
    type: "table" as const,
    name: "Prova Chiusure",
    phone: "071 000000",
    email: undefined,
    shop: SHOP,
    time: "20:00",
    guests: 2,
  };

  it("refuses a date inside a closure, and names the reason", async () => {
    await db.insert(shopClosures).values({
      shopSlug: SHOP,
      fromDate: FUTURE,
      toDate: FUTURE,
      reason: "Ferragosto",
    });
    await expect(
      createReservation({ ...base, date: FUTURE }, { notifyOwner: false, notifyCustomer: false }),
    ).rejects.toThrow(ReservationNotAllowedError);
    await expect(
      createReservation({ ...base, date: FUTURE }, { notifyOwner: false, notifyCustomer: false }),
    ).rejects.toThrow(/Ferragosto/);
  });

  it("still takes the booking from the back office, which warns instead", async () => {
    await db.insert(shopClosures).values({ shopSlug: SHOP, fromDate: FUTURE, toDate: FUTURE });
    const res = await createReservation(
      { ...base, date: FUTURE },
      { notifyOwner: false, notifyCustomer: false, enforceAvailability: false },
    );
    expect(res.reference).toMatch(/^TAC-/);
  });

  it("refuses a malformed date rather than storing it", async () => {
    await expect(
      createReservation(
        { ...base, date: "domani" },
        { notifyOwner: false, notifyCustomer: false },
      ),
    ).rejects.toThrow(/Data non valida/);
  });

  it("refuses a date that does not exist on the calendar", async () => {
    await expect(
      createReservation(
        { ...base, date: "2027-02-31" },
        { notifyOwner: false, notifyCustomer: false },
      ),
    ).rejects.toThrow(/Data non valida/);
  });

  it("refuses a date already past", async () => {
    await expect(
      createReservation(
        { ...base, date: "2020-01-01" },
        { notifyOwner: false, notifyCustomer: false },
      ),
    ).rejects.toThrow(/passata/);
  });

  it("accepts today", async () => {
    const res = await createReservation(
      { ...base, date: dateInRome(), time: "23:30" },
      { notifyOwner: false, notifyCustomer: false },
    );
    expect(res.reference).toMatch(/^TAC-/);
  });
});

describe("createReservation — seats are enforced online, not only at the counter", () => {
  const base = {
    type: "table" as const,
    name: "Coperti",
    phone: "071 000000",
    email: undefined,
    shop: SHOP, // seatsCapacity: 10
    time: "20:00",
  };

  it("refuses the party that would overbook the slot", async () => {
    await createReservation(
      { ...base, date: FUTURE, guests: 8 },
      { notifyOwner: false, notifyCustomer: false },
    );
    // 8 + 4 > 10 — this used to be accepted in silence.
    await expect(
      createReservation(
        { ...base, date: FUTURE, guests: 4 },
        { notifyOwner: false, notifyCustomer: false },
      ),
    ).rejects.toThrow(ReservationNotAllowedError);
  });

  it("says how many seats are left when some remain", async () => {
    await createReservation(
      { ...base, date: FUTURE, guests: 8 },
      { notifyOwner: false, notifyCustomer: false },
    );
    await expect(
      createReservation(
        { ...base, date: FUTURE, guests: 4 },
        { notifyOwner: false, notifyCustomer: false },
      ),
    ).rejects.toThrow(/restano 2 coperti/);
  });

  it("says it in the singular when exactly one seat is left", async () => {
    await createReservation(
      { ...base, date: FUTURE, guests: 9 },
      { notifyOwner: false, notifyCustomer: false },
    );
    await expect(
      createReservation(
        { ...base, date: FUTURE, guests: 2 },
        { notifyOwner: false, notifyCustomer: false },
      ),
    ).rejects.toThrow(/resta 1 coperto\./);
  });

  it("accepts a party that exactly fills the room", async () => {
    const res = await createReservation(
      { ...base, date: FUTURE, guests: 10 },
      { notifyOwner: false, notifyCustomer: false },
    );
    expect(res.reference).toMatch(/^TAC-/);
  });

  it("counts each time slot separately", async () => {
    await createReservation(
      { ...base, date: FUTURE, guests: 10 },
      { notifyOwner: false, notifyCustomer: false },
    );
    const later = await createReservation(
      { ...base, date: FUTURE, time: "21:30", guests: 10 },
      { notifyOwner: false, notifyCustomer: false },
    );
    expect(later.reference).toMatch(/^TAC-/);
  });

  it("a cancelled booking gives its seats back", async () => {
    const first = await createReservation(
      { ...base, date: FUTURE, guests: 10 },
      { notifyOwner: false, notifyCustomer: false },
    );
    await db
      .update(reservations)
      .set({ status: "cancelled" })
      .where(eq(reservations.id, first.id));

    const replacement = await createReservation(
      { ...base, date: FUTURE, guests: 10 },
      { notifyOwner: false, notifyCustomer: false },
    );
    expect(replacement.reference).toMatch(/^TAC-/);
  });

  it("the back office books past a full room, as it always has", async () => {
    await createReservation(
      { ...base, date: FUTURE, guests: 10 },
      { notifyOwner: false, notifyCustomer: false },
    );
    const overbooked = await createReservation(
      { ...base, date: FUTURE, guests: 6 },
      { notifyOwner: false, notifyCustomer: false, enforceAvailability: false },
    );
    expect(overbooked.reference).toMatch(/^TAC-/);
  });
});
