import { describe, it, expect } from "vitest";
import { isSameOrigin } from "@/lib/security/origin";

// env.siteUrl in tests = NEXT_PUBLIC_SITE_URL = http://localhost:3000 (vitest.config).
const SITE = "http://localhost:3000";

function req(headers: Record<string, string>): Request {
  return new Request(`${SITE}/api/something`, { method: "POST", headers });
}

describe("isSameOrigin", () => {
  it("accepts a matching Origin header", () => {
    expect(isSameOrigin(req({ origin: SITE }))).toBe(true);
  });

  it("rejects a foreign Origin header", () => {
    expect(isSameOrigin(req({ origin: "http://evil.example" }))).toBe(false);
  });

  it("falls back to the Referer origin when Origin is absent", () => {
    expect(isSameOrigin(req({ referer: `${SITE}/qualche-pagina` }))).toBe(true);
    expect(isSameOrigin(req({ referer: "http://evil.example/x" }))).toBe(false);
  });

  it("rejects when neither Origin nor Referer is present", () => {
    expect(isSameOrigin(req({}))).toBe(false);
  });

  it("accepts a request whose Host matches (proxy case) via x-forwarded-proto", () => {
    expect(
      isSameOrigin(req({ origin: "https://taccalite.it", host: "taccalite.it", "x-forwarded-proto": "https" })),
    ).toBe(true);
  });
});
