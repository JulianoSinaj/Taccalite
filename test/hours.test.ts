import { describe, it, expect } from "vitest";
import { parseStructuredHours, structuredToRows, shopIsOpenNow, shopWeekGrid } from "@/lib/hours";
import { isOpenNow } from "@/lib/hours";

// "Tutti i giorni" matches any weekday, so these assertions don't depend on the run date.
const allDay = [{ label: "Tutti i giorni", value: "9:00–13:00, 16:00–20:00" }];

describe("isOpenNow", () => {
  it("reports open inside a range", () => {
    const r = isOpenNow(allDay, new Date("2026-07-22T10:30:00"));
    expect(r?.open).toBe(true);
  });

  it("reports closed between ranges", () => {
    const r = isOpenNow(allDay, new Date("2026-07-22T14:00:00"));
    expect(r?.open).toBe(false);
  });

  it("reports open in the second range", () => {
    const r = isOpenNow(allDay, new Date("2026-07-22T17:00:00"));
    expect(r?.open).toBe(true);
  });

  it("treats an explicit Chiuso as closed", () => {
    const r = isOpenNow([{ label: "Tutti i giorni", value: "Chiuso" }], new Date("2026-07-22T12:00:00"));
    expect(r?.open).toBe(false);
  });

  it("fails safe to null on unparseable data", () => {
    expect(isOpenNow([{ label: "???", value: "quando capita" }], new Date("2026-07-22T12:00:00"))).toBeNull();
    expect(isOpenNow([], new Date("2026-07-22T12:00:00"))).toBeNull();
  });
});

describe("parseStructuredHours", () => {
  it("rejects anything unusable rather than half-applying it", () => {
    expect(parseStructuredHours(null)).toBeNull();
    expect(parseStructuredHours("")).toBeNull();
    expect(parseStructuredHours("not json")).toBeNull();
    expect(parseStructuredHours('{"day":1}')).toBeNull(); // not an array
    expect(parseStructuredHours("[]")).toBeNull();
    expect(parseStructuredHours('[{"day":9,"ranges":[]}]')).toBeNull(); // no valid day
  });

  it("keeps an explicitly closed day (empty ranges) as information", () => {
    const parsed = parseStructuredHours('[{"day":7,"ranges":[]}]');
    expect(parsed).toEqual([{ day: 7, ranges: [] }]);
  });

  it("drops a range whose close is not after its open", () => {
    const parsed = parseStructuredHours(
      '[{"day":1,"ranges":[{"open":"09:00","close":"09:00"},{"open":"20:00","close":"02:00"},{"open":"16:00","close":"20:00"}]}]',
    );
    expect(parsed).toEqual([{ day: 1, ranges: [{ open: "16:00", close: "20:00" }] }]);
  });

  it("normalises order and ignores duplicate days", () => {
    const parsed = parseStructuredHours(
      '[{"day":3,"ranges":[{"open":"9","close":"13"}]},{"day":1,"ranges":[{"open":"10:30","close":"12:00"}]},{"day":3,"ranges":[{"open":"7","close":"8"}]}]',
    );
    expect(parsed!.map((d) => d.day)).toEqual([1, 3]);
    // "9"/"13" normalise to HH:MM; the second day-3 entry is ignored.
    expect(parsed![1].ranges).toEqual([{ open: "09:00", close: "13:00" }]);
  });
});

describe("structuredToRows", () => {
  it("collapses consecutive days that share a schedule", () => {
    const week = [1, 2, 3, 4, 5].map((day) => ({
      day,
      ranges: [{ open: "09:00", close: "13:00" }],
    }));
    const rows = structuredToRows([...week, { day: 6, ranges: [{ open: "09:00", close: "19:00" }] }, { day: 7, ranges: [] }]);
    expect(rows).toEqual([
      { label: "Lun–Ven", value: "09:00–13:00" },
      { label: "Sabato", value: "09:00–19:00" },
      { label: "Domenica", value: "Chiuso" },
    ]);
  });

  it("names a single day in full", () => {
    expect(structuredToRows([{ day: 2, ranges: [{ open: "08:00", close: "12:00" }] }])).toEqual([
      { label: "Martedì", value: "08:00–12:00" },
    ]);
  });
});

describe("shopIsOpenNow", () => {
  // 2026-08-12 is a Wednesday.
  const wed = (h: number, m = 0) => new Date(2026, 7, 12, h, m);
  const shop = (structured: { day: number; ranges: { open: string; close: string }[] }[] | null) => ({
    hours: [{ label: "Lun–Ven", value: "questa prosa non è interpretabile" }],
    hoursStructured: structured,
  });

  it("uses structured hours when present, exactly", () => {
    const s = shop([{ day: 3, ranges: [{ open: "09:00", close: "13:00" }, { open: "16:00", close: "20:00" }] }]);
    expect(shopIsOpenNow(s, wed(10))).toEqual({ open: true, nextChange: "13:00" });
    expect(shopIsOpenNow(s, wed(14))).toEqual({ open: false, nextChange: "16:00" });
    expect(shopIsOpenNow(s, wed(21))).toEqual({ open: false });
  });

  it("reports an explicitly closed day as closed, not unknown", () => {
    expect(shopIsOpenNow(shop([{ day: 3, ranges: [] }]), wed(10))).toEqual({ open: false });
  });

  it("says nothing for a day that was never configured", () => {
    expect(shopIsOpenNow(shop([{ day: 1, ranges: [{ open: "09:00", close: "13:00" }] }]), wed(10))).toBeNull();
  });

  it("falls back to the free-text parser when there are no structured hours", () => {
    // Unparseable prose must yield null (never a guess), same as before.
    expect(shopIsOpenNow(shop(null), wed(10))).toBeNull();
    expect(
      shopIsOpenNow({ hours: [{ label: "Mercoledì", value: "9:00–13:00" }], hoursStructured: null }, wed(10)),
    ).toEqual({ open: true, nextChange: "13:00" });
  });
});

describe("free-text hours with a bracketed note", () => {
  // The Centro's real row. With the note left in, the whole value was
  // unparseable and the shop showed no open/closed pill at all.
  const continuato = [
    { label: "Lun – Sab", value: "9:00 – 20:00 (orario continuato)" },
    { label: "Domenica", value: "Chiuso" },
  ];

  it("reads the times and ignores the prose", () => {
    // 2026-08-12 is a Wednesday.
    expect(isOpenNow(continuato, new Date(2026, 7, 12, 10, 0))).toEqual({
      open: true,
      nextChange: "20:00",
    });
    expect(isOpenNow(continuato, new Date(2026, 7, 12, 21, 0))).toEqual({ open: false });
  });

  it("still refuses to guess when there are no times at all", () => {
    expect(isOpenNow([{ label: "Lun – Sab", value: "(su appuntamento)" }], new Date(2026, 7, 12, 10, 0))).toBeNull();
  });
});

describe("shopWeekGrid", () => {
  it("prefers structured hours and returns all seven days in minutes", () => {
    const grid = shopWeekGrid({
      hours: [{ label: "Lun–Ven", value: "prosa non interpretabile" }],
      hoursStructured: [
        { day: 1, ranges: [{ open: "07:00", close: "13:30" }] },
        { day: 7, ranges: [] },
      ],
    });
    expect(grid).not.toBeNull();
    expect(grid!.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(grid![0]).toEqual({ day: 1, name: "Lunedì", ranges: [{ start: 420, end: 810 }] });
    // Explicitly closed stays [], a day nobody configured stays null.
    expect(grid![6].ranges).toEqual([]);
    expect(grid![1].ranges).toBeNull();
  });

  it("expands a free-text weekday range across the days it covers", () => {
    const grid = shopWeekGrid({
      hours: [
        { label: "Lun – Sab", value: "9:00 – 20:00 (orario continuato)" },
        { label: "Domenica", value: "Chiuso" },
      ],
      hoursStructured: null,
    });
    expect(grid).not.toBeNull();
    for (const day of grid!.slice(0, 6)) {
      expect(day.ranges).toEqual([{ start: 540, end: 1200 }]);
    }
    expect(grid![6].ranges).toEqual([]);
  });

  it("returns null when not one day could be read", () => {
    expect(shopWeekGrid({ hours: [], hoursStructured: null })).toBeNull();
    expect(
      shopWeekGrid({ hours: [{ label: "???", value: "quando capita" }], hoursStructured: null }),
    ).toBeNull();
  });
});
