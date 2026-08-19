import { describe, it, expect } from "vitest";
import { parseStructuredHours, structuredToRows, shopIsOpenNow } from "@/lib/hours";
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
