import { describe, it, expect } from "vitest";
import { normalizeCode } from "@/lib/discounts";

describe("normalizeCode", () => {
  it("uppercases and trims", () => {
    expect(normalizeCode("  benvenuto10 ")).toBe("BENVENUTO10");
    expect(normalizeCode("Estate-25")).toBe("ESTATE-25");
  });
});

// The discount math is exercised end-to-end via createOrder in domain-db tests;
// here we lock the pure normalisation used to match user input to stored codes.
