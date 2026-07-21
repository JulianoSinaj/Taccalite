import { describe, it, expect } from "vitest";
import { generateTotpSecret, totpToken, verifyTotp, otpauthUri } from "@/lib/auth/totp";

describe("TOTP", () => {
  const secret = generateTotpSecret();
  const t = 1_700_000_000_000; // fixed instant

  it("generates a base32 secret", () => {
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(30);
  });

  it("produces a 6-digit code", () => {
    expect(totpToken(secret, t)).toMatch(/^\d{6}$/);
  });

  it("verifies the current code and rejects a wrong one", () => {
    const code = totpToken(secret, t);
    expect(verifyTotp(secret, code, t)).toBe(true);
    expect(verifyTotp(secret, "000000", t)).toBe(false);
    expect(verifyTotp(secret, "abc", t)).toBe(false);
  });

  it("tolerates ±1 step of drift but not more", () => {
    const code = totpToken(secret, t);
    expect(verifyTotp(secret, code, t + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, t - 30_000)).toBe(true);
    expect(verifyTotp(secret, code, t + 90_000)).toBe(false);
  });

  it("builds an otpauth URI (label percent-encoded per spec)", () => {
    const uri = otpauthUri(secret, "admin");
    expect(uri).toContain("otpauth://totp/Taccalite%3Aadmin?");
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain("issuer=Taccalite");
  });
});
