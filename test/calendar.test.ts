import { describe, it, expect } from "vitest";
import {
  addDays,
  addMonths,
  clampIso,
  daysInMonth,
  formatLongIt,
  formatMediumIt,
  mondayIndex,
  monthGrid,
  monthLabelIt,
  parseIso,
  toIso,
} from "@/lib/calendar";

/**
 * The date picker's arithmetic. Everything here is timezone-free by
 * construction — the helpers build at UTC and read back with `getUTC*` — and
 * these cases are the ones that catch it if that ever stops being true: the
 * ends of months, the ends of years, and the DST weekends, where a picker that
 * reached for local time renders the same day twice or skips one.
 */

describe("parseIso", () => {
  it("accepts a well-formed day", () => {
    expect(parseIso("2026-08-27")).toEqual({ y: 2026, m: 8, d: 27 });
  });

  it("refuses a day the month does not have", () => {
    expect(parseIso("2026-02-30")).toBeNull();
    expect(parseIso("2026-04-31")).toBeNull();
  });

  it("accepts 29 February only in a leap year", () => {
    expect(parseIso("2024-02-29")).toEqual({ y: 2024, m: 2, d: 29 });
    expect(parseIso("2026-02-29")).toBeNull();
  });

  it("refuses anything that is not yyyy-mm-dd", () => {
    for (const bad of ["", "2026-8-27", "27/08/2026", "2026-13-01", "2026-00-10", "oggi"]) {
      expect(parseIso(bad)).toBeNull();
    }
    expect(parseIso(null)).toBeNull();
    expect(parseIso(undefined)).toBeNull();
  });
});

describe("daysInMonth", () => {
  it("knows the short months and February", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("mondayIndex", () => {
  it("counts from Monday, not from Sunday", () => {
    // 2026-08-24 is a Monday, 2026-08-30 the Sunday that closes that week.
    expect(mondayIndex({ y: 2026, m: 8, d: 24 })).toBe(0);
    expect(mondayIndex({ y: 2026, m: 8, d: 29 })).toBe(5);
    expect(mondayIndex({ y: 2026, m: 8, d: 30 })).toBe(6);
  });
});

describe("addDays", () => {
  it("crosses a month end", () => {
    expect(toIso(addDays({ y: 2026, m: 1, d: 31 }, 1))).toBe("2026-02-01");
  });

  it("crosses a year end in both directions", () => {
    expect(toIso(addDays({ y: 2026, m: 12, d: 31 }, 1))).toBe("2027-01-01");
    expect(toIso(addDays({ y: 2026, m: 1, d: 1 }, -1))).toBe("2025-12-31");
  });

  it("does not lose or repeat a day across the DST switches", () => {
    // Italy springs forward on the last Sunday of March and back on the last of
    // October. A picker doing this in local time renders 29 March twice.
    expect(toIso(addDays({ y: 2026, m: 3, d: 28 }, 1))).toBe("2026-03-29");
    expect(toIso(addDays({ y: 2026, m: 3, d: 29 }, 1))).toBe("2026-03-30");
    expect(toIso(addDays({ y: 2026, m: 10, d: 24 }, 1))).toBe("2026-10-25");
    expect(toIso(addDays({ y: 2026, m: 10, d: 25 }, 1))).toBe("2026-10-26");
  });
});

describe("addMonths", () => {
  it("clamps the day instead of rolling into the next month", () => {
    // The whole point: "next month" from 31 January must be February, not March.
    expect(toIso(addMonths({ y: 2026, m: 1, d: 31 }, 1))).toBe("2026-02-28");
    expect(toIso(addMonths({ y: 2024, m: 1, d: 31 }, 1))).toBe("2024-02-29");
    expect(toIso(addMonths({ y: 2026, m: 5, d: 31 }, 1))).toBe("2026-06-30");
  });

  it("walks backwards over a year boundary", () => {
    expect(toIso(addMonths({ y: 2026, m: 1, d: 15 }, -1))).toBe("2025-12-15");
    expect(toIso(addMonths({ y: 2026, m: 1, d: 15 }, -13))).toBe("2024-12-15");
  });
});

describe("monthGrid", () => {
  it("is always six full weeks, so the panel never changes height", () => {
    for (const [y, m] of [
      [2026, 2],
      [2026, 8],
      [2026, 11],
      [2024, 2],
    ] as const) {
      expect(monthGrid(y, m)).toHaveLength(42);
    }
  });

  it("starts on the Monday on or before the 1st", () => {
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    const grid = monthGrid(2026, 8);
    expect(grid[0]).toBe("2026-07-27");
    expect(grid[5]).toBe("2026-08-01");
    expect(mondayIndex(parseIso(grid[0])!)).toBe(0);
  });

  it("starts on the 1st when the 1st is itself a Monday", () => {
    // 1 June 2026 is a Monday: no leading days from May.
    expect(monthGrid(2026, 6)[0]).toBe("2026-06-01");
  });

  it("runs consecutively with no gap or repeat", () => {
    const grid = monthGrid(2026, 8);
    for (let i = 1; i < grid.length; i += 1) {
      expect(grid[i]).toBe(toIso(addDays(parseIso(grid[i - 1])!, 1)));
    }
  });

  it("contains every day of the month it is for", () => {
    const grid = monthGrid(2026, 2);
    for (let d = 1; d <= 28; d += 1) {
      expect(grid).toContain(`2026-02-${String(d).padStart(2, "0")}`);
    }
  });
});

describe("clampIso", () => {
  it("pulls a date back inside the bounds", () => {
    expect(clampIso("2026-08-01", "2026-08-27")).toBe("2026-08-27");
    expect(clampIso("2026-12-31", undefined, "2026-09-30")).toBe("2026-09-30");
    expect(clampIso("2026-08-28", "2026-08-27", "2026-09-30")).toBe("2026-08-28");
  });
});

describe("Italian labels", () => {
  it("names the month and the weekday", () => {
    expect(monthLabelIt(2026, 8)).toBe("Agosto 2026");
    expect(formatLongIt("2026-08-29")).toBe("sabato 29 agosto 2026");
    expect(formatMediumIt("2026-08-29")).toBe("sab 29 ago 2026");
  });

  it("returns an empty string rather than a stray undefined for a bad day", () => {
    expect(formatLongIt("")).toBe("");
    expect(formatMediumIt("nope")).toBe("");
  });
});
