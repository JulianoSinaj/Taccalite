import { describe, it, expect } from "vitest";
import { scryptSync, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword, needsRehash } from "@/lib/auth/password";

/** Reconstruct a legacy paramless hash (`scrypt$salt$hash`, Node default N=2^14). */
function legacyHash(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`;
}

describe("password hashing", () => {
  it("round-trips a current-format hash", () => {
    const h = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", h)).toBe(true);
    expect(verifyPassword("wrong password", h)).toBe(false);
  });

  it("encodes cost params inline (N=2^16) and does not flag for rehash", () => {
    const h = hashPassword("pw");
    const parts = h.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBe(1 << 16);
    expect(needsRehash(h)).toBe(false);
  });

  it("still verifies legacy paramless hashes (backward compatible)", () => {
    const legacy = legacyHash("old pw");
    expect(verifyPassword("old pw", legacy)).toBe(true);
    expect(verifyPassword("nope", legacy)).toBe(false);
  });

  it("flags legacy and malformed hashes for rehash", () => {
    expect(needsRehash(legacyHash("x"))).toBe(true);
    expect(needsRehash("not-a-hash")).toBe(true);
    expect(needsRehash("")).toBe(true);
  });

  it("produces a unique salt per hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});
