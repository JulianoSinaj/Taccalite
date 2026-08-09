import { describe, it, expect } from "vitest";
import {
  splitGross,
  vatBreakdown,
  totalImposta,
  vatRateLabel,
  apportion,
  orderVatBuckets,
  aggregateVatBuckets,
} from "@/lib/fiscal";

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

describe("apportion", () => {
  it("splits a total across weights and re-sums exactly", () => {
    expect(apportion(100, [1, 1])).toEqual([50, 50]);
    // 100 over 1:2 → 33/67 with the leftover cent going to the larger remainder
    const parts = apportion(100, [1, 2]);
    expect(parts.reduce((s, x) => s + x, 0)).toBe(100);
    expect(parts).toEqual([33, 67]);
  });

  it("returns zeros for a zero total or zero weight-sum", () => {
    expect(apportion(0, [3, 5])).toEqual([0, 0]);
    expect(apportion(50, [0, 0])).toEqual([0, 0]);
  });

  it("never creates or loses a cent across many splits", () => {
    for (const total of [1, 7, 99, 1234, 99999]) {
      for (const weights of [[1, 1, 1], [3, 5, 8], [1, 1000], [7]]) {
        if (total > weights.reduce((s, w) => s + w, 0) * 1e6) continue;
        const parts = apportion(total, weights);
        expect(parts.reduce((s, x) => s + x, 0)).toBe(total);
        expect(parts.every((p) => p >= 0)).toBe(true);
      }
    }
  });
});

describe("orderVatBuckets", () => {
  it("matches a plain breakdown when there is no discount or shipping", () => {
    const items = [
      { grossCents: 1100, vatRateBps: 1000 },
      { grossCents: 1220, vatRateBps: 2200 },
    ];
    const buckets = orderVatBuckets({ items, discountCents: 0, shippingCents: 0, shippingVatBps: 2200 });
    expect(buckets).toEqual(vatBreakdown(items));
  });

  it("apportions a cart discount across rate buckets and reconciles to the total", () => {
    // €10 @10% + €10 @22% goods (gross 1100 + 1220 = 2320), €2.00 coupon, no shipping.
    const items = [
      { grossCents: 1100, vatRateBps: 1000 },
      { grossCents: 1220, vatRateBps: 2200 },
    ];
    const discountCents = 200;
    const buckets = orderVatBuckets({ items, discountCents, shippingCents: 0, shippingVatBps: 2200 });
    const totalGross = buckets.reduce((s, b) => s + b.grossCents, 0);
    // subtotal − discount = 2320 − 200 = 2120
    expect(totalGross).toBe(2120);
    // imponibile + imposta always reconciles with the discounted gross
    expect(buckets.reduce((s, b) => s + b.imponibileCents + b.impostaCents, 0)).toBe(2120);
    // discount split pro-rata: ~1100/2320 to the 10% bucket, rest to 22%
    const b10 = buckets.find((b) => b.rateBps === 1000)!;
    const b22 = buckets.find((b) => b.rateBps === 2200)!;
    expect(b10.grossCents + b22.grossCents).toBe(2120);
    expect(b10.grossCents).toBeLessThan(1100);
    expect(b22.grossCents).toBeLessThan(1220);
  });

  it("adds shipping under its own rate and still reconciles to the total", () => {
    const items = [{ grossCents: 1000, vatRateBps: 1000 }];
    const buckets = orderVatBuckets({ items, discountCents: 0, shippingCents: 700, shippingVatBps: 2200 });
    // subtotal + shipping = 1000 + 700 = 1700
    expect(buckets.reduce((s, b) => s + b.grossCents, 0)).toBe(1700);
    const b22 = buckets.find((b) => b.rateBps === 2200)!;
    expect(b22.grossCents).toBe(700);
  });

  it("never lets the discount exceed the subtotal", () => {
    const items = [{ grossCents: 1000, vatRateBps: 2200 }];
    const buckets = orderVatBuckets({ items, discountCents: 5000, shippingCents: 0, shippingVatBps: 2200 });
    // fully discounted goods → no positive bucket
    expect(buckets.reduce((s, b) => s + b.grossCents, 0)).toBe(0);
  });
});

describe("aggregateVatBuckets", () => {
  it("sums several orders' buckets by rate", () => {
    const o1 = orderVatBuckets({
      items: [{ grossCents: 1100, vatRateBps: 1000 }],
      discountCents: 0,
      shippingCents: 0,
      shippingVatBps: 2200,
    });
    const o2 = orderVatBuckets({
      items: [{ grossCents: 1220, vatRateBps: 2200 }, { grossCents: 550, vatRateBps: 1000 }],
      discountCents: 0,
      shippingCents: 0,
      shippingVatBps: 2200,
    });
    const agg = aggregateVatBuckets([o1, o2]);
    const b10 = agg.find((b) => b.rateBps === 1000)!;
    const b22 = agg.find((b) => b.rateBps === 2200)!;
    expect(b10.grossCents).toBe(1100 + 550);
    expect(b22.grossCents).toBe(1220);
    expect(agg.map((b) => b.rateBps)).toEqual([1000, 2200]);
  });
});
