import { describe, it, expect } from "vitest";
import {
  normalizeCap,
  matchZone,
  zoneSpecificity,
  quoteFulfilment,
  billableWeightKg,
  type ZoneLike,
} from "@/lib/fulfilment";
import { pickupSlotOptions, resolvePickupSlot, isoWeekday, type SlotLike } from "@/lib/pickup-slots";
import { instantInRome } from "@/lib/time";

const zone = (over: Partial<ZoneLike> & { name: string }): ZoneLike => ({
  id: over.name,
  mode: "shipping",
  postcodes: [],
  shopSlug: null,
  feeCents: 0,
  freeOverCents: null,
  minOrderCents: 0,
  perKgCents: null,
  leadTimeHours: 0,
  note: "",
  sortOrder: 0,
  active: true,
  ...over,
});

describe("normalizeCap", () => {
  it("keeps five digits and drops everything else", () => {
    expect(normalizeCap(" 60121 ")).toBe("60121");
    expect(normalizeCap("I-60.121")).toBe("60121");
    expect(normalizeCap("601211")).toBe("60121");
    expect(normalizeCap(null)).toBe("");
  });
});

describe("matchZone", () => {
  // The whole point of scoring: a CAP is covered by several zones at once and
  // the customer must be quoted the most specific one, not whichever row the
  // database happened to return first.
  const zones = [
    zone({ name: "Resto d'Italia", postcodes: [], feeCents: 700, sortOrder: 100 }),
    zone({ name: "Provincia AN", postcodes: ["60"], feeCents: 500, sortOrder: 50 }),
    zone({ name: "Ancona centro", postcodes: ["60121", "60122"], feeCents: 300, sortOrder: 10 }),
  ];

  it("prefers an exact CAP over a prefix over the catch-all", () => {
    expect(matchZone(zones, "60121", "shipping")?.name).toBe("Ancona centro");
    expect(matchZone(zones, "60131", "shipping")?.name).toBe("Provincia AN");
    expect(matchZone(zones, "20121", "shipping")?.name).toBe("Resto d'Italia");
  });

  it("never matches a zone of the other mode", () => {
    const vanOnly = [zone({ name: "Giro furgone", mode: "delivery", postcodes: ["60121"] })];
    expect(matchZone(vanOnly, "60121", "delivery")?.name).toBe("Giro furgone");
    expect(matchZone(vanOnly, "60121", "shipping")).toBeNull();
  });

  it("ignores a suspended zone", () => {
    const suspended = [zone({ name: "Sospesa", postcodes: ["60121"], active: false })];
    expect(matchZone(suspended, "60121", "shipping")).toBeNull();
  });

  it("scores an empty postcode list as the catch-all, not as no match", () => {
    expect(zoneSpecificity(zone({ name: "x" }), "60121")).toBe(0);
    expect(zoneSpecificity(zone({ name: "x", postcodes: ["70"] }), "60121")).toBe(-1);
  });
});

describe("quoteFulfilment", () => {
  const zones = [
    zone({ name: "Italia", postcodes: [], feeCents: 700, freeOverCents: 6000, sortOrder: 100 }),
    zone({
      name: "Ancona",
      mode: "delivery",
      postcodes: ["601"],
      feeCents: 300,
      minOrderCents: 2500,
      leadTimeHours: 24,
    }),
  ];

  it("charges nothing for a pickup and asks for no CAP", () => {
    const q = quoteFulfilment({ mode: "pickup", subtotalCents: 1000, zones });
    expect(q).toEqual({ feeCents: 0, zone: null, error: null, freeApplied: false });
  });

  it("asks for the CAP before it can price anything", () => {
    const q = quoteFulfilment({ mode: "shipping", subtotalCents: 1000, zones, cap: "601" });
    expect(q.error).toMatch(/CAP/);
    expect(q.feeCents).toBe(0);
  });

  it("refuses a CAP no zone serves, naming the alternatives", () => {
    const vanOnly = [zones[1]];
    const q = quoteFulfilment({ mode: "delivery", subtotalCents: 5000, zones: vanOnly, cap: "20121" });
    expect(q.zone).toBeNull();
    expect(q.error).toContain("20121");
    expect(q.error).toMatch(/ritiro in bottega/i);
  });

  it("blocks an under-minimum basket and says how much is missing", () => {
    const q = quoteFulfilment({ mode: "delivery", subtotalCents: 2000, zones, cap: "60121" });
    expect(q.zone?.name).toBe("Ancona");
    expect(q.error).toContain("5,00"); // 25,00 minimum less 20,00 in the basket
  });

  it("waives the fee at the threshold, and only at the threshold", () => {
    const under = quoteFulfilment({ mode: "shipping", subtotalCents: 5999, zones, cap: "20121" });
    const at = quoteFulfilment({ mode: "shipping", subtotalCents: 6000, zones, cap: "20121" });
    expect(under.feeCents).toBe(700);
    expect(at.feeCents).toBe(0);
    expect(at.freeApplied).toBe(true);
  });

  it("lets a free-shipping coupon waive the fee but not the minimum", () => {
    const free = quoteFulfilment({
      mode: "shipping",
      subtotalCents: 1000,
      zones,
      cap: "20121",
      freeShippingCoupon: true,
    });
    expect(free.feeCents).toBe(0);

    const stillBlocked = quoteFulfilment({
      mode: "delivery",
      subtotalCents: 1000,
      zones,
      cap: "60121",
      freeShippingCoupon: true,
    });
    expect(stillBlocked.error).toMatch(/minimo/i);
  });

  it("adds the per-kg surcharge on top of the flat fee", () => {
    const heavy = [zone({ name: "Pesante", postcodes: [], feeCents: 500, perKgCents: 150 })];
    const q = quoteFulfilment({ mode: "shipping", subtotalCents: 5000, zones: heavy, cap: "60121", weightKg: 4 });
    expect(q.feeCents).toBe(500 + 600);
  });
});

describe("billableWeightKg", () => {
  it("counts a weighed line by its weight and a per-kg line by its quantity", () => {
    expect(
      billableWeightKg([
        { weightKg: 1.35, quantity: 1, soldByWeight: true, unit: "kg" },
        { quantity: 2, soldByWeight: true, unit: "kg" },
        // Not sold by weight: contributes nothing rather than a guess.
        { quantity: 3, soldByWeight: false, unit: "kg" },
        { quantity: 4, soldByWeight: true, unit: "pezzo" },
      ]),
    ).toBe(3.35);
  });
});

describe("instantInRome", () => {
  it("resolves a summer wall clock through CEST", () => {
    expect(instantInRome("2026-08-22", "10:00").toISOString()).toBe("2026-08-22T08:00:00.000Z");
  });

  it("resolves a winter wall clock through CET", () => {
    expect(instantInRome("2026-01-15", "10:00").toISOString()).toBe("2026-01-15T09:00:00.000Z");
  });

  it("gets the day either side of the spring change right", () => {
    // Italy moves to CEST at 02:00 on the last Sunday of March (2026-03-29).
    expect(instantInRome("2026-03-28", "10:00").toISOString()).toBe("2026-03-28T09:00:00.000Z");
    expect(instantInRome("2026-03-29", "10:00").toISOString()).toBe("2026-03-29T08:00:00.000Z");
  });
});

describe("pickupSlotOptions", () => {
  const slot = (over: Partial<SlotLike> & { id: string }): SlotLike => ({
    shopSlug: "centro",
    weekday: 6,
    startTime: "09:00",
    endTime: "10:00",
    capacityOrders: null,
    cutoffHours: 2,
    active: true,
    ...over,
  });

  // Saturday 22 August 2026, 06:00 Rome (04:00 UTC).
  const now = new Date("2026-08-22T04:00:00.000Z");

  it("offers today's window when the cut-off still allows it", () => {
    const out = pickupSlotOptions([slot({ id: "a" })], { now, days: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe("2026-08-22T09:00");
    expect(out[0].label).toContain("09:00–10:00");
  });

  it("drops a window already inside its cut-off", () => {
    // 09:00 with four hours' notice needed, and it is already 06:00.
    const out = pickupSlotOptions([slot({ id: "a", cutoffHours: 4 })], { now, days: 1 });
    expect(out).toHaveLength(0);
  });

  it("treats the cut-off itself as too late", () => {
    // Exactly three hours before a 09:00 window with three hours' notice. The
    // boundary belongs to the shop, not the customer: "ordina almeno 3 ore
    // prima" has to mean strictly more than three.
    const out = pickupSlotOptions([slot({ id: "a", cutoffHours: 3 })], { now, days: 1 });
    expect(out).toHaveLength(0);
  });

  it("only produces windows on the weekday they are scheduled for", () => {
    const out = pickupSlotOptions([slot({ id: "a", weekday: 2 })], { now, days: 7 });
    expect(out).toHaveLength(1);
    expect(isoWeekday(out[0].date)).toBe(2);
    expect(out[0].date).toBe("2026-08-25");
  });

  it("hides a full window rather than letting it be chosen and refused", () => {
    const at = instantInRome("2026-08-22", "09:00").getTime();
    const out = pickupSlotOptions([slot({ id: "a", capacityOrders: 2 })], {
      now,
      days: 1,
      bookedCounts: new Map([[`centro|${at}`, 2]]),
    });
    expect(out).toHaveLength(0);
  });

  it("reports how many places are left in a capped window", () => {
    const at = instantInRome("2026-08-22", "09:00").getTime();
    const out = pickupSlotOptions([slot({ id: "a", capacityOrders: 5 })], {
      now,
      days: 1,
      bookedCounts: new Map([[`centro|${at}`, 3]]),
    });
    expect(out[0].remaining).toBe(2);
  });

  it("returns windows in chronological order across days and shops", () => {
    const out = pickupSlotOptions(
      [
        slot({ id: "late", startTime: "17:00", endTime: "18:00" }),
        slot({ id: "early", startTime: "09:00", endTime: "10:00" }),
        slot({ id: "sun", weekday: 7, startTime: "08:00", endTime: "09:00" }),
      ],
      { now, days: 3 },
    );
    expect(out.map((o) => o.value)).toEqual([
      "2026-08-22T09:00",
      "2026-08-22T17:00",
      "2026-08-23T08:00",
    ]);
  });
});

describe("resolvePickupSlot", () => {
  const slots: SlotLike[] = [
    {
      id: "a",
      shopSlug: "centro",
      weekday: 6,
      startTime: "09:00",
      endTime: "10:00",
      capacityOrders: 1,
      cutoffHours: 2,
      active: true,
    },
  ];
  const now = new Date("2026-08-22T04:00:00.000Z");

  it("requires no window where the shop has published none", () => {
    // The pre-slot behaviour, and the reason a shop can ignore this feature.
    expect(resolvePickupSlot([], "centro", null, { now })).toEqual({
      ok: true,
      atMs: null,
      option: null,
    });
  });

  it("insists on a window once the shop publishes any", () => {
    const r = resolvePickupSlot(slots, "centro", null, { now });
    expect(r.ok).toBe(false);
  });

  it("accepts a window that is still open", () => {
    const r = resolvePickupSlot(slots, "centro", "2026-08-22T09:00", { now });
    expect(r).toMatchObject({ ok: true, atMs: instantInRome("2026-08-22", "09:00").getTime() });
  });

  it("refuses a window that filled up while the form was open", () => {
    const at = instantInRome("2026-08-22", "09:00").getTime();
    const r = resolvePickupSlot(slots, "centro", "2026-08-22T09:00", {
      now,
      bookedCounts: new Map([[`centro|${at}`, 1]]),
    });
    expect(r.ok).toBe(false);
  });

  it("refuses a window belonging to another shop", () => {
    const r = resolvePickupSlot(slots, "carni", "2026-08-22T09:00", { now });
    expect(r.ok).toBe(false);
  });

  it("refuses a hand-crafted time that is on no schedule", () => {
    const r = resolvePickupSlot(slots, "centro", "2026-08-22T03:00", { now });
    expect(r.ok).toBe(false);
  });
});
