import { describe, it, expect } from "vitest";
import { isOpenNow, todayRowIndex } from "@/lib/hours";

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

describe("todayRowIndex", () => {
  const week = [
    { label: "Lun – Sab", value: "9:00 – 20:00" },
    { label: "Domenica", value: "Chiuso" },
  ];

  it("picks the range row on a weekday", () => {
    // 2026-07-22 is a Wednesday.
    expect(todayRowIndex(week, new Date("2026-07-22T10:00:00"))).toBe(0);
  });

  it("picks the single-day row on Sunday", () => {
    // 2026-07-26 is a Sunday.
    expect(todayRowIndex(week, new Date("2026-07-26T10:00:00"))).toBe(1);
  });

  it("returns -1 when nothing matches or data is unusable", () => {
    expect(todayRowIndex([{ label: "???", value: "x" }], new Date("2026-07-22T10:00:00"))).toBe(-1);
    expect(todayRowIndex([], new Date("2026-07-22T10:00:00"))).toBe(-1);
    expect(todayRowIndex(null, new Date("2026-07-22T10:00:00"))).toBe(-1);
  });
});
