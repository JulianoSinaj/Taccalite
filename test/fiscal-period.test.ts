import { describe, it, expect, afterEach } from "vitest";
import { vatPeriod } from "@/lib/fiscal-period";
import { dateInRome, instantInRome } from "@/lib/time";

/**
 * Fiscal period bounds — the instants that decide which month a sale is filed in.
 *
 * The period is *chosen* on the Rome calendar (`dateInRome`), so its bounds have
 * to be *read* on the same clock. They were not: `new Date("2026-09-01T00:00:00")`
 * is parsed in the server's own zone, which is UTC in the Docker image. A
 * September period therefore began at 02:00 Rome, and a sale settled at 00:30 on
 * the 1st fell outside it — declared in August, while the orders list, the
 * invoice register and the cash-up all dated it September.
 *
 * Every case below pins `TZ` so the assertions mean the same thing on a
 * developer's Italian laptop and on a UTC container. Under `TZ=UTC` and the old
 * bounds, the two "lands in the month the shop says" cases fail.
 */

const REAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = REAL_TZ;
});

/** Run `fn` as if the server's clock were in `tz`. */
function asServerIn<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  return fn();
}

// 00:30 on 1 September, Rome wall clock (CEST, +2) — 22:30Z the day before.
const SUMMER_SALE = new Date("2026-08-31T22:30:00Z");
// 00:30 on 1 February, Rome wall clock (CET, +1) — 23:30Z the day before.
const WINTER_SALE = new Date("2026-01-31T23:30:00Z");

describe("vatPeriod — bounds are Rome midnight, not the server's", () => {
  for (const tz of ["UTC", "Europe/Rome", "America/New_York"]) {
    it(`starts the period at Rome midnight (server in ${tz})`, () => {
      const p = asServerIn(tz, () => vatPeriod({ periodo: "mese" }, SUMMER_SALE));
      expect(p.fromISO).toBe("2026-09-01");
      // CEST is +2, so Rome midnight on 1 Sep is 22:00Z on 31 Aug.
      expect(p.from.toISOString()).toBe("2026-08-31T22:00:00.000Z");
      expect(p.from.getTime()).toBe(instantInRome(p.fromISO, "00:00").getTime());
    });
  }

  it("ends the period at the Rome midnight that opens the next one", () => {
    const p = asServerIn("UTC", () => vatPeriod({ periodo: "mese" }, SUMMER_SALE));
    expect(p.toISO).toBe("2026-09-30");
    expect(p.toExclusive.getTime()).toBe(instantInRome("2026-10-01", "00:00").getTime());
  });
});

describe("vatPeriod — a sale is filed in the month the shop says it is", () => {
  it("keeps a 00:30 sale on 1 September in September, not August (CEST)", () => {
    asServerIn("UTC", () => {
      expect(dateInRome(SUMMER_SALE)).toBe("2026-09-01");
      const sept = vatPeriod({ periodo: "mese" }, SUMMER_SALE);
      const aug = vatPeriod({ periodo: "mese-scorso" }, SUMMER_SALE);
      expect(SUMMER_SALE >= sept.from && SUMMER_SALE < sept.toExclusive).toBe(true);
      expect(SUMMER_SALE >= aug.from && SUMMER_SALE < aug.toExclusive).toBe(false);
    });
  });

  it("keeps a 00:30 sale on 1 February in February, not January (CET)", () => {
    asServerIn("UTC", () => {
      expect(dateInRome(WINTER_SALE)).toBe("2026-02-01");
      const feb = vatPeriod({ periodo: "mese" }, WINTER_SALE);
      const jan = vatPeriod({ periodo: "mese-scorso" }, WINTER_SALE);
      expect(feb.fromISO).toBe("2026-02-01");
      // CET is +1, so Rome midnight on 1 Feb is 23:00Z on 31 Jan.
      expect(feb.from.toISOString()).toBe("2026-01-31T23:00:00.000Z");
      expect(WINTER_SALE >= feb.from && WINTER_SALE < feb.toExclusive).toBe(true);
      expect(WINTER_SALE >= jan.from && WINTER_SALE < jan.toExclusive).toBe(false);
    });
  });
});

describe("vatPeriod — consecutive periods tile without gap or overlap", () => {
  it("hands off from one month to the next at the same instant", () => {
    asServerIn("UTC", () => {
      const aug = vatPeriod({ periodo: "mese-scorso" }, SUMMER_SALE);
      const sept = vatPeriod({ periodo: "mese" }, SUMMER_SALE);
      expect(aug.toExclusive.getTime()).toBe(sept.from.getTime());
    });
  });

  it("hands off from one quarter to the next at the same instant", () => {
    asServerIn("UTC", () => {
      const prev = vatPeriod({ periodo: "trimestre-scorso" }, SUMMER_SALE);
      const cur = vatPeriod({ periodo: "trimestre" }, SUMMER_SALE);
      expect(prev.toExclusive.getTime()).toBe(cur.from.getTime());
    });
  });

  it("spans an explicit range on the same clock", () => {
    asServerIn("UTC", () => {
      const p = vatPeriod({ da: "2026-03-01", a: "2026-03-31" }, SUMMER_SALE);
      // The DST change falls inside this range: it opens in CET and closes in CEST.
      expect(p.from.toISOString()).toBe("2026-02-28T23:00:00.000Z");
      expect(p.toExclusive.toISOString()).toBe("2026-03-31T22:00:00.000Z");
    });
  });
});
