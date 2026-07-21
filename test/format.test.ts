import { describe, it, expect } from "vitest";
import { formatEuro } from "@/lib/format";

describe("formatEuro", () => {
  it("formats integer cents as euros with two decimals", () => {
    expect(formatEuro(1900)).toBe("€ 19.00");
    expect(formatEuro(450)).toBe("€ 4.50");
    expect(formatEuro(0)).toBe("€ 0.00");
    expect(formatEuro(199)).toBe("€ 1.99");
  });
});
