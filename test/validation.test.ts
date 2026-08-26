import { describe, it, expect } from "vitest";
import { reservationSchema } from "@/lib/validation/reservation";
import { registerSchema, loginSchema, passwordResetSchema } from "@/lib/validation/auth";
import { checkoutSchema } from "@/lib/validation/order";
import { productInput } from "@/lib/validation/admin";

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

/**
 * Two bugs that made the product unusable while every existing test, `tsc`,
 * `eslint` and `next build` stayed green. Both are about the gap between what a
 * *browser form* actually submits and what the schema was written to expect,
 * which is why only driving the real UI found them.
 */
describe("checkoutSchema tolerates what a real form posts", () => {
  const base = {
    items: [{ slug: "ciauscolo-igp", quantity: 1 }],
    name: "Mario Rossi",
    email: "mario@example.com",
    fulfilment: "pickup" as const,
    paymentMethod: "in_store" as const,
    shopSlug: "centro",
  };

  it("accepts null for the address fields a pickup order does not render", () => {
    // `FormData.get` returns **null** for an input that is not in the DOM, and
    // the checkout only renders the address block for delivery/shipping. Zod's
    // `.optional()` accepts a missing key and rejects an explicit null, so every
    // pickup order was refused with a raw English "expected string, received
    // null" and no order was ever created.
    const r = checkoutSchema.safeParse({ ...base, address: null, city: null, zip: null, phone: null, notes: null });
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
    if (r.success) {
      expect(r.data.address).toBeUndefined();
      expect(r.data.city).toBeUndefined();
    }
  });

  it("still refuses a delivery order with no address", () => {
    // The null tolerance must not weaken the rule it sits next to: someone has
    // to drive to a delivery.
    const r = checkoutSchema.safeParse({ ...base, fulfilment: "delivery", address: null, city: null, zip: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => String(i.path[0]));
      expect(paths).toContain("address");
      expect(r.error.issues.every((i) => /[àèéìòù]|Inserisci/.test(i.message))).toBe(true); // Italian, not raw Zod
    }
  });

  it("still enforces length limits on a value that is present", () => {
    expect(checkoutSchema.safeParse({ ...base, notes: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("admin checkbox fields survive being left unticked", () => {
  const base = { name: "Salame", shopSlug: "centro", priceEuros: "6.90", vatRate: "10", sortOrder: "0" };

  it("parses a product form with no checkbox keys at all", () => {
    // An unticked checkbox is not submitted — that is how HTML forms work. The
    // helper used `z.union([…, z.undefined()])` behind a transform, which Zod v4
    // wraps in a `nonoptional` check that rejects an absent key, so creating a
    // product failed outright: `purchasable` and `soldByWeight` start unticked.
    const r = productInput.safeParse(base);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
    if (r.success) {
      expect(r.data.purchasable).toBe(false);
      expect(r.data.soldByWeight).toBe(false);
      expect(r.data.active).toBe(false);
    }
  });

  it("reads a ticked box as true and a null as false", () => {
    const on = productInput.safeParse({ ...base, purchasable: "on", active: "on" });
    expect(on.success && on.data.purchasable).toBe(true);
    expect(on.success && on.data.active).toBe(true);
    const off = productInput.safeParse({ ...base, purchasable: null });
    expect(off.success && off.data.purchasable).toBe(false);
  });

  it("keeps the rule that a purchasable product needs a real price", () => {
    const r = productInput.safeParse({ ...base, priceEuros: "0", purchasable: "on" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/prezzo maggiore di zero/i);
  });
});
