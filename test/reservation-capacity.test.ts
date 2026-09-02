import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { reservations, shops } from "@/lib/db/schema";
import { createReservation, ReservationNotAllowedError } from "@/lib/reservations";

/**
 * A room that is full has to be full at the moment of the write.
 *
 * The kilos of porchetta have been summed *inside* the insert transaction since
 * the beginning, with a comment explaining exactly why: two concurrent
 * pre-orders both reading an under-cap total, both confirming, and more
 * porchetta sold than the Saturday can produce. Seats were capped later and got
 * the check but not the placement — so two parties booking the last table at
 * the same moment both read the room as free, and Saturday dinner was
 * double-booked by precisely the mechanism the kilo cap was written to prevent.
 */

const SHOP = "res-cap-shop";
const TIME = "20:00";

/** A date comfortably in the future, so no cut-off or past-date rule fires. */
function futureIso(days = 10): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const DATE = futureIso();

const booking = (guests: number) =>
  createReservation(
    {
      type: "table",
      name: "Cliente",
      phone: "0711234567",
      email: "tavolo@example.com",
      shop: SHOP,
      date: DATE,
      time: TIME,
      guests,
    },
    { notifyOwner: false, notifyCustomer: false },
  );

const booked = () =>
  db
    .select()
    .from(reservations)
    .where(and(eq(reservations.shopSlug, SHOP), eq(reservations.date, DATE)));

beforeAll(async () => {
  await db
    .insert(shops)
    .values({
      slug: SHOP,
      name: "Sede coperti",
      specialty: "test",
      reservationsEnabled: true,
      seatsCapacity: 4,
    })
    .onConflictDoUpdate({
      target: shops.slug,
      set: { seatsCapacity: 4, reservationsEnabled: true },
    });
});

beforeEach(async () => {
  await db.delete(reservations).where(eq(reservations.shopSlug, SHOP));
});

describe("table seating capacity", () => {
  it("seats a party that fits", async () => {
    const res = await booking(4);
    expect(res.reference).toBeTruthy();
    expect(await booked()).toHaveLength(1);
  });

  it("refuses a party that would overbook the room, in sequence", async () => {
    await booking(3);
    await expect(booking(2)).rejects.toBeInstanceOf(ReservationNotAllowedError);
    expect(await booked()).toHaveLength(1);
  });

  it("names how many seats are actually left", async () => {
    await booking(3);
    await expect(booking(2)).rejects.toThrow(/resta 1 coperto/);
  });

  it("ignores a shop with no seating limit configured", async () => {
    await db.update(shops).set({ seatsCapacity: 0 }).where(eq(shops.slug, SHOP));
    await booking(4);
    await booking(4);
    expect(await booked()).toHaveLength(2);
    await db.update(shops).set({ seatsCapacity: 4 }).where(eq(shops.slug, SHOP));
  });

  it("lets only one of two simultaneous parties take the last table", async () => {
    // The race the in-transaction decision exists for. Both read the room as
    // free before either row existed; the second is now refused on the rule
    // rather than seated.
    await booking(2);
    const settled = await Promise.allSettled([booking(2), booking(2)]);

    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = settled.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(ReservationNotAllowedError);

    const rows = await booked();
    expect(rows).toHaveLength(2);
    expect(rows.reduce((n, r) => n + (r.guests ?? 0), 0)).toBe(4);
  });
});
