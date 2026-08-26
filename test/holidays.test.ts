import { describe, it, expect } from "vitest";
import { easterSunday, italianHolidays } from "@/lib/holidays";

describe("easterSunday", () => {
  it("matches the published dates", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2038)).toBe("2038-04-25"); // the latest possible
    expect(easterSunday(2285)).toBe("2285-03-22"); // the earliest possible
  });
});

describe("italianHolidays", () => {
  it("lists the twelve national holidays in calendar order", () => {
    const list = italianHolidays(2026);
    expect(list).toHaveLength(12);
    expect(list.map((h) => h.date)).toEqual([...list.map((h) => h.date)].sort());
    expect(list.find((h) => h.name === "Lunedì dell'Angelo")?.date).toBe("2026-04-06");
    expect(list.find((h) => h.name === "Ferragosto")?.date).toBe("2026-08-15");
    expect(list.find((h) => h.name === "Santo Stefano")?.date).toBe("2026-12-26");
  });
});
