import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// The actions read the session cookie and revalidate routes, both of which want
// Next's request scope. Stub them so the guards can be exercised here.
vi.mock("next/headers", () => {
  const jar = new Map<string, string>();
  return {
    cookies: async () => ({
      get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined),
      set: (k: string, v: string) => void jar.set(k, v),
      delete: (k: string) => void jar.delete(k),
    }),
    headers: async () => new Headers(),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pickupSlots, shops, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { loginUser } from "@/lib/auth/service";
import { getPickupSlots } from "@/lib/db/queries";
import {
  savePickupSlot,
  generatePickupSlots,
  setShopPickupSlotsActive,
  deleteShopPickupSlots,
} from "@/lib/admin/fulfilment-actions";

/**
 * The pickup schedule as the admin edits it on «Zone e fasce»: a start time is
 * unique per shop and day whether the window is new or edited, generating from
 * the opening hours replaces the schedule rather than layering onto it, and
 * the per-shop bulk buttons do what they say.
 */

const SHOP = "fa-test-shop";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const idle = { status: "idle" as const };

const addSlot = (weekday: string, startTime: string, endTime: string, id?: string) =>
  savePickupSlot(
    idle,
    form({ shopSlug: SHOP, weekday, startTime, endTime, active: "on", ...(id ? { id } : {}) }),
  );

const rowsFor = () =>
  db
    .select()
    .from(pickupSlots)
    .where(eq(pickupSlots.shopSlug, SHOP))
    .orderBy(asc(pickupSlots.weekday), asc(pickupSlots.startTime));

beforeAll(async () => {
  await db
    .insert(shops)
    .values({
      slug: SHOP,
      name: "Fasce",
      specialty: "Test",
      // Monday 09–12 fits three 60-minute windows; Tuesday 09–10:30 fits one
      // 60-minute window and none of 120.
      hoursStructured: [
        { day: 1, ranges: [{ open: "09:00", close: "12:00" }] },
        { day: 2, ranges: [{ open: "09:00", close: "10:30" }] },
      ],
    })
    .onConflictDoNothing({ target: shops.slug });

  await db
    .insert(users)
    .values({
      username: "fa-admin",
      email: "fa-admin@example.com",
      name: "Admin",
      passwordHash: hashPassword("Password!234"),
      role: "admin",
    })
    .onConflictDoNothing({ target: users.username });
  const res = await loginUser({ identifier: "fa-admin", password: "Password!234" });
  expect(res.ok).toBe(true);
});

beforeEach(async () => {
  await db.delete(pickupSlots).where(eq(pickupSlots.shopSlug, SHOP));
});

describe("savePickupSlot", () => {
  it("refuses a second window with the same start on the same day", async () => {
    expect((await addSlot("1", "09:00", "10:00")).status).toBe("success");
    const dup = await addSlot("1", "09:00", "11:00");
    expect(dup.status).toBe("error");
    expect(dup.message).toMatch(/Esiste già una fascia/);
    expect(await rowsFor()).toHaveLength(1);
  });

  it("refuses editing a window onto another window's start, but not onto its own", async () => {
    await addSlot("1", "09:00", "10:00");
    await addSlot("1", "10:00", "11:00");
    const [, second] = await rowsFor();

    // Moving the 10:00 window to 09:00 would collide with the first — a sentence,
    // not "UNIQUE constraint failed".
    const clash = await addSlot("1", "09:00", "11:00", second.id);
    expect(clash.status).toBe("error");
    expect(clash.message).toMatch(/Esiste già una fascia/);

    // Changing only the end keeps the same start: the row must not clash with itself.
    const ok = await addSlot("1", "10:00", "11:30", second.id);
    expect(ok.status).toBe("success");
    const [, after] = await rowsFor();
    expect(after.endTime).toBe("11:30");
  });

  it("names a missing window instead of reporting a save that changed nothing", async () => {
    const res = await addSlot("1", "09:00", "10:00", "fa-no-such-slot");
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/Fascia non trovata/);
    expect(await rowsFor()).toHaveLength(0);
  });
});

describe("generatePickupSlots", () => {
  const generate = (minutes: string) =>
    generatePickupSlots(idle, form({ shopSlug: SHOP, minutes, cutoffHours: "2" }));

  it("cuts whole windows out of the opening hours", async () => {
    const res = await generate("60");
    expect(res.status).toBe("success");
    const rows = await rowsFor();
    expect(rows.map((r) => `${r.weekday} ${r.startTime}-${r.endTime}`)).toEqual([
      "1 09:00-10:00",
      "1 10:00-11:00",
      "1 11:00-12:00",
      "2 09:00-10:00",
    ]);
  });

  it("replaces the previous schedule rather than leaving stubs beside it", async () => {
    await generate("30"); // 6 on Monday + 3 on Tuesday
    expect(await rowsFor()).toHaveLength(9);
    await addSlot("7", "10:00", "11:00"); // a hand-made Sunday window

    // Longer windows: the :30 starts must go, not survive as half-hour stubs
    // overlapping the new hour-long ones.
    const res = await generate("120");
    expect(res.status).toBe("success");
    expect(res.message).toMatch(/10 precedenti sostituite/);
    const rows = await rowsFor();
    expect(rows.map((r) => `${r.weekday} ${r.startTime}-${r.endTime}`)).toEqual(["1 09:00-11:00"]);
  });
});

describe("bulk per-shop actions", () => {
  it("suspends and reactivates every window, hiding them from the storefront in between", async () => {
    await addSlot("1", "09:00", "10:00");
    await addSlot("2", "09:00", "10:00");

    const off = await setShopPickupSlotsActive(idle, form({ shopSlug: SHOP, active: "false" }));
    expect(off.status).toBe("success");
    expect(off.message).toMatch(/^2 fasce sospese/);
    expect((await rowsFor()).every((r) => !r.active)).toBe(true);
    // The checkout reads active rows only: no picker, pickup without a time.
    expect(await getPickupSlots(SHOP)).toHaveLength(0);

    const again = await setShopPickupSlotsActive(idle, form({ shopSlug: SHOP, active: "false" }));
    expect(again.message).toMatch(/Nessuna fascia da sospendere/);

    const on = await setShopPickupSlotsActive(idle, form({ shopSlug: SHOP, active: "true" }));
    expect(on.message).toMatch(/^2 fasce riattivate/);
    expect(await getPickupSlots(SHOP)).toHaveLength(2);
  });

  it("deletes every window of the shop and only that shop", async () => {
    await addSlot("1", "09:00", "10:00");
    await addSlot("1", "10:00", "11:00");
    const res = await deleteShopPickupSlots(idle, form({ shopSlug: SHOP }));
    expect(res.status).toBe("success");
    expect(res.message).toMatch(/^2 fasce eliminate/);
    expect(await rowsFor()).toHaveLength(0);

    const empty = await deleteShopPickupSlots(idle, form({ shopSlug: SHOP }));
    expect(empty.message).toMatch(/Nessuna fascia da eliminare/);
  });

  it("refuses an unknown shop", async () => {
    const res = await deleteShopPickupSlots(idle, form({ shopSlug: "fa-nowhere" }));
    expect(res.status).toBe("error");
    expect(res.message).toMatch(/Sede non valida/);
  });
});
