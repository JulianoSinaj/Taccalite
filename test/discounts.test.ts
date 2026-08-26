import { describe, it, expect } from "vitest";
import { normalizeCode, discountState } from "@/lib/discounts";

describe("normalizeCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeCode("  benvenuto10 ")).toBe("BENVENUTO10");
    expect(normalizeCode("Estate-25")).toBe("ESTATE-25");
  });
});

describe("discountState", () => {
  const now = new Date("2026-06-15T12:00:00");
  const base = { active: true, startsAt: null, endsAt: null, maxRedemptions: null, timesUsed: 0 };

  it("is live with no restrictions", () => {
    expect(discountState(base, now)).toBe("active");
  });

  it("reports why a code cannot be used, in the order validation refuses", () => {
    expect(discountState({ ...base, active: false }, now)).toBe("inactive");
    expect(discountState({ ...base, endsAt: new Date("2026-06-01") }, now)).toBe("expired");
    expect(discountState({ ...base, maxRedemptions: 2, timesUsed: 2 }, now)).toBe("exhausted");
    expect(discountState({ ...base, startsAt: new Date("2026-07-01") }, now)).toBe("scheduled");
    // Expired wins over exhausted: the date is the reason nobody can revive it.
    expect(
      discountState({ ...base, endsAt: new Date("2026-06-01"), maxRedemptions: 1, timesUsed: 1 }, now),
    ).toBe("expired");
  });

  it("is live inside its window and under its cap", () => {
    expect(
      discountState(
        { ...base, startsAt: new Date("2026-06-01"), endsAt: new Date("2026-06-30"), maxRedemptions: 5, timesUsed: 4 },
        now,
      ),
    ).toBe("active");
  });
});

// The discount math is exercised end-to-end via createOrder in domain-db tests;
// here we lock the pure normalisation used to match user input to stored codes.
