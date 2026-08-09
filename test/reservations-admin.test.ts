import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { shops, reservations, settings } from "@/lib/db/schema";
import { createReservation, checkPorchettaCapacity } from "@/lib/reservations";
import { filterQuery } from "@/lib/admin/filters";

const SHOP = "cap-shop";
const DATE = "2026-09-05"; // a Saturday, well clear of other fixtures

async function setCapacity(kg: number) {
  await db
    .insert(settings)
    .values({ key: "porchetta.weeklyCapacityKg", value: kg })
    .onConflictDoUpdate({ target: settings.key, set: { value: kg } });
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
