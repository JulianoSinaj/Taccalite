import { describe, it, expect } from "vitest";
import { splitGross, vatBreakdown, totalImposta, vatRateLabel } from "@/lib/fiscal";

describe("splitGross", () => {
  it("splits a VAT-inclusive gross into base + tax that re-sum exactly", () => {
    // 22% on €12.20 gross → €10.00 base + €2.20 tax
    expect(splitGross(1220, 2200)).toEqual({ imponibileCents: 1000, impostaCents: 220 });
    // 10% on €11.00 gross → €10.00 base + €1.00 tax
    expect(splitGross(1100, 1000)).toEqual({ imponibileCents: 1000, impostaCents: 100 });
  });

  it("never drifts: base + tax always equals the gross", () => {
    for (const gross of [1, 99, 333, 1999, 4567, 100000]) {
      for (const rate of [400, 500, 1000, 2200]) {
        const { imponibileCents, impostaCents } = splitGross(gross, rate);
        expect(imponibileCents + impostaCents).toBe(gross);
      }
    }
  });
});

describe("vatBreakdown", () => {
  it("aggregates lines into one bucket per rate, ordered ascending", () => {
    const buckets = vatBreakdown([
      { grossCents: 1100, vatRateBps: 1000 },
      { grossCents: 500, vatRateBps: 1000 },
      { grossCents: 1220, vatRateBps: 2200 },
    ]);
    expect(buckets.map((b) => b.rateBps)).toEqual([1000, 2200]);
    expect(buckets[0].grossCents).toBe(1600);
    expect(buckets[1].impostaCents).toBe(220);
  });

  it("ignores zero-gross lines", () => {
    expect(vatBreakdown([{ grossCents: 0, vatRateBps: 2200 }])).toEqual([]);
  });
});

describe("totalImposta / vatRateLabel", () => {
  it("sums tax across buckets", () => {
    const buckets = vatBreakdown([
      { grossCents: 1100, vatRateBps: 1000 },
      { grossCents: 1220, vatRateBps: 2200 },
    ]);
    expect(totalImposta(buckets)).toBe(100 + 220);
  });

  it("labels bps as a percent", () => {
    expect(vatRateLabel(2200)).toBe("22%");
    expect(vatRateLabel(400)).toBe("4%");
  });
});
