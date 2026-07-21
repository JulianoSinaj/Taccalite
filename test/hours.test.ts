import { describe, it, expect } from "vitest";
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
