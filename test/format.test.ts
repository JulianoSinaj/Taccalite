import { describe, it, expect } from "vitest";
import { formatEuro } from "@/lib/format";

describe("formatEuro", () => {
  it("formats integer cents as euros with two decimals", () => {
    expect(formatEuro(1900)).toBe("€ 19,00");
    expect(formatEuro(450)).toBe("€ 4,50");
    expect(formatEuro(0)).toBe("€ 0,00");
    expect(formatEuro(199)).toBe("€ 1,99");
  });

  // The shop is Italian and so is every reader of a price on this site: the
  // decimal separator is a comma. The previous `toFixed(2)` rendered
  // "€ 1250.00", which reads as a different number entirely to an Italian
  // customer.
  //
  // Grouping follows CLDR's `min2` rule for it-IT: a four-digit number is left
  // ungrouped ("1250,00") and the separator only appears from five digits
  // ("12.345,67"). That is the locale-correct behaviour, and it is asserted here
  // so nobody "fixes" it back to always-group.
  it("uses Italian separators", () => {
    expect(formatEuro(125000)).toBe("€ 1250,00");
    expect(formatEuro(1234567)).toBe("€ 12.345,67");
  });
});
