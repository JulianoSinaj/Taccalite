import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { products, reservations, shops, users } from "@/lib/db/schema";
import { shopInput } from "@/lib/validation/admin";
import { adminShopReferences } from "@/lib/admin/queries";
import { createReservation } from "@/lib/reservations";
import { isoWeekdayOf, openRangesOn, openStateAt, timeSlotsOn } from "@/lib/hours";

const SHOP = "hours-shop"; // structured hours, bookings enabled
const REFS = "refs-shop"; // referenced by a product and a user
const WEDNESDAY = "2026-09-09";
const SUNDAY = "2026-09-13";

/** Mon–Fri 9–13 / 16–20, Saturday 9–13, Sunday closed. */
const WEEK = [
  ...[1, 2, 3, 4, 5].map((day) => ({
    day,
    ranges: [
      { open: "09:00", close: "13:00" },
      { open: "16:00", close: "20:00" },
    ],
  })),
  { day: 6, ranges: [{ open: "09:00", close: "13:00" }] },
  { day: 7, ranges: [] },
];

beforeAll(async () => {
  await db
    .insert(shops)
    .values([
      { slug: SHOP, name: "Orari", specialty: "test", hoursStructured: WEEK, reservationsEnabled: true },
      { slug: REFS, name: "Riferimenti", specialty: "test" },
    ])
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  await db.delete(reservations).where(inArray(reservations.shopSlug, [SHOP, REFS]));
  await db.delete(products).where(eq(products.shopSlug, REFS));
  await db.delete(users).where(eq(users.username, "refs-staff"));
});

describe("shopInput", () => {
  const base = { name: "Sede", slug: "sede" };

  it("accepts a blank email and rejects a malformed one", () => {
    expect(shopInput.parse({ ...base, email: "" }).email).toBeUndefined();
    expect(shopInput.parse({ ...base, email: " info@example.it " }).email).toBe("info@example.it");
    expect(() => shopInput.parse({ ...base, email: "non-una-email" })).toThrow(/Email non valida/);
  });

  it("no longer carries the dead addressConfirmed flag", () => {
    // The toggle was stored and read by nothing on the site; the schema drops
    // it so an old form post cannot resurrect it. The column itself is gone too
    // as of drizzle/0044, so a post that got through would now fail the insert
    // rather than write a value nothing reads.
    const parsed = shopInput.parse({ ...base, addressConfirmed: "on" }) as Record<string, unknown>;
    expect("addressConfirmed" in parsed).toBe(false);
  });
});

describe("opening hours on a date", () => {
  const shop = { hours: [], hoursStructured: WEEK };

  it("maps ISO dates to ISO weekdays and rejects impossible ones", () => {
    expect(isoWeekdayOf(WEDNESDAY)).toBe(3);
    expect(isoWeekdayOf(SUNDAY)).toBe(7);
    expect(isoWeekdayOf("2026-02-30")).toBeNull();
    expect(isoWeekdayOf("domani")).toBeNull();
  });

  it("reads the day's ranges, an explicit closed day, and unknown hours", () => {
    expect(openRangesOn(shop, WEDNESDAY)).toEqual([
      { start: 540, end: 780 },
      { start: 960, end: 1200 },
    ]);
    expect(openRangesOn(shop, SUNDAY)).toEqual([]);
    // Free text nothing can parse: unknown, not closed.
    expect(openRangesOn({ hours: [{ label: "Sempre", value: "quando capita" }] }, WEDNESDAY)).toBeNull();
  });

  it("answers open/closed for a wall-clock time without a Date", () => {
    expect(openStateAt(shop, WEDNESDAY, "10:30")).toEqual({ open: true, nextChange: "13:00" });
    expect(openStateAt(shop, WEDNESDAY, "14:00")).toEqual({ open: false, nextChange: "16:00" });
    expect(openStateAt(shop, WEDNESDAY, "21:00")).toEqual({ open: false });
    expect(openStateAt(shop, SUNDAY, "11:00")).toEqual({ open: false });
    expect(openStateAt({ hours: [] }, WEDNESDAY, "11:00")).toBeNull();
  });

  it("offers half-hour slots inside the ranges and none on a closed day", () => {
    const slots = timeSlotsOn(shop, WEDNESDAY)!;
    expect(slots[0]).toBe("09:00");
    expect(slots).toContain("12:30");
    expect(slots).not.toContain("13:00"); // closing time is not bookable
    expect(slots).not.toContain("14:00");
    expect(slots).toContain("16:00");
    expect(slots.at(-1)).toBe("19:30");
    expect(timeSlotsOn(shop, SUNDAY)).toEqual([]);
    expect(timeSlotsOn({ hours: [] }, WEDNESDAY)).toBeNull();
  });

  it("aligns an odd opening time to the step", () => {
    const odd = { hours: [], hoursStructured: [{ day: 3, ranges: [{ open: "09:15", close: "10:30" }] }] };
    expect(timeSlotsOn(odd, WEDNESDAY)).toEqual(["09:30", "10:00"]);
  });
});

describe("createReservation and opening hours", () => {
  const quiet = { notifyOwner: false, notifyCustomer: false };

  it("refuses a table at an hour the sede is shut and names the next opening", async () => {
    await expect(
      createReservation(
        { type: "table", name: "Web", phone: "1", email: undefined, shop: SHOP, date: WEDNESDAY, time: "14:00", guests: 2 },
        quiet,
      ),
    ).rejects.toThrow(/chiusa: apre alle 16:00/);
  });

  it("refuses a table on a weekday the sede is closed", async () => {
    await expect(
      createReservation(
        { type: "table", name: "Web", phone: "1", email: undefined, shop: SHOP, date: SUNDAY, time: "11:00", guests: 2 },
        quiet,
      ),
    ).rejects.toThrow(/chiusa/);
  });

  it("accepts a table inside the opening hours", async () => {
    const created = await createReservation(
      { type: "table", name: "Web", phone: "1", email: undefined, shop: SHOP, date: WEDNESDAY, time: "10:00", guests: 2 },
      quiet,
    );
    expect(created.reference).toMatch(/^TAC-/);
  });

  it("lets the back office book past the hours — it warns, it does not block", async () => {
    const created = await createReservation(
      { type: "table", name: "Telefono", phone: "1", email: undefined, shop: SHOP, date: WEDNESDAY, time: "14:00", guests: 2 },
      { ...quiet, enforceAvailability: false },
    );
    expect(created.reference).toMatch(/^TAC-/);
  });
});

describe("adminShopReferences", () => {
  it("counts what still points at a sede, table by table", async () => {
    expect(await adminShopReferences(REFS)).toEqual({ products: 0, orders: 0, reservations: 0, users: 0 });

    await db.insert(products).values({ name: "Pecorino", slug: "refs-pecorino", shopSlug: REFS, category: "Formaggi" });
    await db
      .insert(users)
      .values({ username: "refs-staff", name: "Staff", passwordHash: "x", role: "staff", shopSlug: REFS });
    await db
      .insert(reservations)
      .values({ reference: "REFS-1", type: "table", name: "A", phone: "1", date: WEDNESDAY, shopSlug: REFS });

    expect(await adminShopReferences(REFS)).toEqual({ products: 1, orders: 0, reservations: 1, users: 1 });
  });
});
