import { describe, it, expect } from "vitest";
import { reservationSchema } from "@/lib/validation/reservation";
import { registerSchema, loginSchema } from "@/lib/validation/auth";

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
  it("accepts a valid registration and lowercases the username", () => {
    const r = registerSchema.safeParse({ name: "Anna", username: "Anna_B", password: "supersegreta" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.username).toBe("anna_b");
  });

  it("rejects invalid username characters and short passwords", () => {
    expect(registerSchema.safeParse({ name: "Anna", username: "bad name!", password: "supersegreta" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Anna", username: "anna", password: "short" }).success).toBe(false);
  });

  it("loginSchema requires a username and any non-empty password", () => {
    expect(loginSchema.safeParse({ username: "anna", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ username: "anna", password: "" }).success).toBe(false);
  });
});
