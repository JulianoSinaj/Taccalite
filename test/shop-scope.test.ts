import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, reservations, shops, users } from "@/lib/db/schema";
import { inScope, lockShop } from "@/lib/admin/scope";
import { getOrderForReservation } from "@/lib/admin/queries";

const A = "scope-shop-a";
const B = "scope-shop-b";
const RES = "scope-res-1";
const ORD = "scope-ord-1";

beforeAll(async () => {
  await db
    .insert(shops)
    .values([
      { slug: A, name: "Sede A", specialty: "test" },
      { slug: B, name: "Sede B", specialty: "test" },
    ])
    .onConflictDoNothing({ target: shops.slug });
});

beforeEach(async () => {
  await db.delete(orders).where(inArray(orders.id, [ORD, `${ORD}-2`]));
  await db.delete(reservations).where(eq(reservations.id, RES));
  await db.delete(users).where(inArray(users.username, ["scope-staff", "scope-admin"]));
});

describe("shop scope", () => {
  it("forces the facet for a scoped operator and leaves an admin alone", () => {
    // A scoped operator cannot widen the view by editing the query string, and
    // cannot narrow it to somebody else's shop either — the answer does not
    // depend on what was asked for.
    expect(lockShop("scope-shop-b", A)).toBe(A);
    expect(lockShop(undefined, A)).toBe(A);
    expect(lockShop("scope-shop-b", null)).toBe("scope-shop-b");
    expect(lockShop(undefined, null)).toBeUndefined();
  });

  it("lets a row with no location through to everyone", () => {
    // A courier shipment belongs to the business, not to a counter.
    expect(inScope(null, A)).toBe(true);
    expect(inScope(A, A)).toBe(true);
    expect(inScope(B, A)).toBe(false);
    expect(inScope(B, null)).toBe(true);
  });

  it("stores a staff account's location and leaves existing accounts unscoped", async () => {
    await db.insert(users).values([
      { username: "scope-staff", name: "Staff", passwordHash: "x", role: "staff", shopSlug: A },
      { username: "scope-admin", name: "Admin", passwordHash: "x", role: "admin" },
    ]);
    const rows = await db
      .select()
      .from(users)
      .where(inArray(users.username, ["scope-staff", "scope-admin"]));
    expect(rows.find((u) => u.username === "scope-staff")!.shopSlug).toBe(A);
    // Null is "every location" — which is what every account was before the
    // column existed, so an install that never assigns one is unchanged.
    expect(rows.find((u) => u.username === "scope-admin")!.shopSlug).toBeNull();
  });
});

describe("reservation → order link", () => {
  async function makeBooking() {
    await db.insert(reservations).values({
      id: RES,
      reference: "SCOPE-1",
      type: "order",
      name: "Cliente",
      phone: "333",
      date: "2099-01-01",
      shopSlug: A,
    });
  }

  it("reports the order a booking became", async () => {
    await makeBooking();
    expect(await getOrderForReservation(RES)).toBeNull();

    await db.insert(orders).values({
      id: ORD,
      orderNumber: "SCOPE-ORD-1",
      email: "x@y.it",
      name: "Cliente",
      shopSlug: A,
      reservationId: RES,
    });
    expect((await getOrderForReservation(RES))?.orderNumber).toBe("SCOPE-ORD-1");
  });

  it("refuses to convert the same booking twice", async () => {
    // The button hides itself once converted, but a stale tab can still post.
    // The unique index is what actually holds the line.
    await makeBooking();
    await db.insert(orders).values({
      id: ORD,
      orderNumber: "SCOPE-ORD-1",
      email: "x@y.it",
      name: "Cliente",
      shopSlug: A,
      reservationId: RES,
    });
    await expect(
      db.insert(orders).values({
        id: `${ORD}-2`,
        orderNumber: "SCOPE-ORD-2",
        email: "x@y.it",
        name: "Cliente",
        shopSlug: A,
        reservationId: RES,
      }),
    ).rejects.toThrow();
  });

  it("still allows any number of orders with no booking behind them", async () => {
    // SQLite treats NULLs as distinct in a unique index, which is exactly what
    // the 600 existing orders need.
    await db.insert(orders).values([
      { id: ORD, orderNumber: "SCOPE-ORD-1", email: "x@y.it", name: "A", shopSlug: A },
      { id: `${ORD}-2`, orderNumber: "SCOPE-ORD-2", email: "x@y.it", name: "B", shopSlug: A },
    ]);
    const rows = await db.select().from(orders).where(inArray(orders.id, [ORD, `${ORD}-2`]));
    expect(rows).toHaveLength(2);
  });
});
