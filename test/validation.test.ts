import { describe, it, expect } from "vitest";
import { reservationSchema } from "@/lib/validation/reservation";
import { registerSchema, loginSchema, passwordResetSchema } from "@/lib/validation/auth";

describe("reservationSchema", () => {
  const base = { name: "Mario Rossi", phone: "0711234567", shop: "centro" };

  it("accepts a valid table reservation", () => {
    const r = reservationSchema.safeParse({ ...base, type: "table", date: "2026-08-01", time: "20:00", guests: 4 });
    expect(r.success).toBe(true);
  });

  it("coerces guests from a string and rejects a missing date on a table booking", () => {
    const ok = reservationSchema.safeParse({ ...base, type: "table", date: "2026-08-01", time: "20:00", guests: "2" });
    expect(ok.success && ok.data.guests).toBe(2);
    const bad = reservationSchema.safeParse({ ...base, type: "table", time: "20:00", guests: 2 });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.some((i) => i.path[0] === "date")).toBe(true);
  });

  it("requires quantityKg for a porchetta reservation", () => {
    expect(reservationSchema.safeParse({ ...base, type: "porchetta", date: "2026-08-01", quantityKg: 1.5 }).success).toBe(true);
    const bad = reservationSchema.safeParse({ ...base, type: "porchetta", date: "2026-08-01" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.error.issues.some((i) => i.path[0] === "quantityKg")).toBe(true);
  });

  it("requires notes for a special order", () => {
    expect(reservationSchema.safeParse({ ...base, type: "order", notes: "2 taglieri" }).success).toBe(true);
    expect(reservationSchema.safeParse({ ...base, type: "order" }).success).toBe(false);
  });

  it("rejects a too-short name and normalizes an empty email to undefined", () => {
    expect(reservationSchema.safeParse({ ...base, name: "M", type: "order", notes: "x" }).success).toBe(false);
    const r = reservationSchema.safeParse({ ...base, type: "order", notes: "x", email: "" });
    expect(r.success && r.data.email).toBeUndefined();
  });
});

describe("auth schemas", () => {
  it("accepts a registration without a username and lowercases the email", () => {
    const r = registerSchema.safeParse({ name: "Anna", email: "Anna.B@Example.IT", password: "supersegreta" });
    expect(r.success).toBe(true);
    // Nobody picks a handle any more — `deriveUsername` builds one from the address.
    if (r.success) {
      expect(r.data.email).toBe("anna.b@example.it");
      expect(r.data.username).toBeUndefined();
    }
  });

  it("requires an email, because an account without one cannot be recovered", () => {
    expect(registerSchema.safeParse({ name: "Anna", password: "supersegreta" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Anna", email: "", password: "supersegreta" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Anna", email: "not-an-email", password: "supersegreta" }).success).toBe(false);
  });

  it("still honours an explicitly supplied username, and its charset", () => {
    const r = registerSchema.safeParse({ name: "Anna", email: "a@b.it", username: "Anna_B", password: "supersegreta" });
    expect(r.success && r.data.username).toBe("anna_b");
    expect(registerSchema.safeParse({ name: "Anna", email: "a@b.it", username: "bad name!", password: "supersegreta" }).success).toBe(false);
  });

  it("rejects short passwords", () => {
    expect(registerSchema.safeParse({ name: "Anna", email: "a@b.it", password: "short" }).success).toBe(false);
  });

  it("loginSchema takes either an email or a legacy handle as the identifier", () => {
    expect(loginSchema.safeParse({ identifier: "anna", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "anna@example.it", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ identifier: "anna", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: "", password: "x" }).success).toBe(false);
  });

  it("normalizes the identifier so case and stray spaces can't fork an account", () => {
    const r = loginSchema.safeParse({ identifier: "  Anna@Example.IT ", password: "x" });
    expect(r.success && r.data.identifier).toBe("anna@example.it");
  });

  it("passwordResetSchema needs both a token and a long-enough password", () => {
    expect(passwordResetSchema.safeParse({ token: "abc", password: "supersegreta" }).success).toBe(true);
    expect(passwordResetSchema.safeParse({ token: "", password: "supersegreta" }).success).toBe(false);
    expect(passwordResetSchema.safeParse({ token: "abc", password: "short" }).success).toBe(false);
  });
});
