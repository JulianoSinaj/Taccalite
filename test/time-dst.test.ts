import { describe, it, expect } from "vitest";
import { instantInRome, timeInRome, dateInRome } from "@/lib/time";

/**
 * Every date gate in the platform resolves against Italian local time, and the
 * server runs UTC in the Docker image. The two moments a year when those differ
 * by an hour more or less than yesterday are the ones nobody tests — and a
 * pickup window, a closure, a cut-off or a digest landing an hour out on the
 * last Sunday in March is the sort of bug that gets blamed on the customer.
 *
 * Italy 2026: forward Sun 29 March (02:00 -> 03:00), back Sun 25 October
 * (03:00 -> 02:00).
 */

/** A wall-clock time stored and read back must be the same wall-clock time. */
const roundTrips = (isoDate: string, time: string) => {
  const at = instantInRome(isoDate, time);
  return `${dateInRome(at)} ${timeInRome(at)}`;
};

describe("instantInRome across DST", () => {
  it("round-trips an ordinary winter time", () => {
    expect(roundTrips("2026-01-15", "09:00")).toBe("2026-01-15 09:00");
  });

  it("round-trips an ordinary summer time", () => {
    expect(roundTrips("2026-06-15", "20:00")).toBe("2026-06-15 20:00");
  });

  it("round-trips either side of the spring forward", () => {
    expect(roundTrips("2026-03-28", "10:00")).toBe("2026-03-28 10:00");
    expect(roundTrips("2026-03-29", "01:30")).toBe("2026-03-29 01:30");
    expect(roundTrips("2026-03-29", "03:30")).toBe("2026-03-29 03:30");
    expect(roundTrips("2026-03-30", "10:00")).toBe("2026-03-30 10:00");
  });

  it("round-trips either side of the autumn fall back", () => {
    expect(roundTrips("2026-10-24", "10:00")).toBe("2026-10-24 10:00");
    expect(roundTrips("2026-10-25", "01:30")).toBe("2026-10-25 01:30");
    expect(roundTrips("2026-10-26", "10:00")).toBe("2026-10-26 10:00");
  });

  it("puts a shop day one real hour apart on either side of a change", () => {
    // 10:00 on consecutive days is 24 hours apart on the wall clock but 23 in
    // real time across the spring forward. A slot generator that assumed 24
    // would place every window after it an hour out.
    const before = instantInRome("2026-03-28", "10:00").getTime();
    const after = instantInRome("2026-03-29", "10:00").getTime();
    expect(after - before).toBe(23 * 3_600_000);

    const octBefore = instantInRome("2026-10-24", "10:00").getTime();
    const octAfter = instantInRome("2026-10-25", "10:00").getTime();
    expect(octAfter - octBefore).toBe(25 * 3_600_000);
  });

  it("returns a whole-minute offset, not one drifting by milliseconds", () => {
    const at = instantInRome("2026-06-15", "20:00");
    expect(at.getTime() % 60_000).toBe(0);
  });
});

describe("the start of a shop day, across DST", () => {
  it("lands on local midnight either side of a change", () => {
    // The shape `lib/admin/filters.ts` uses to bound a date range: a filter for
    // "orders on the 29th" must start at Italian midnight, not UTC midnight.
    const romeDayStart = (iso: string) => instantInRome(iso, "00:00");
    for (const day of ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-25", "2026-10-26"]) {
      const start = romeDayStart(day);
      expect(`${dateInRome(start)} ${timeInRome(start)}`).toBe(`${day} 00:00`);
    }
  });
});
