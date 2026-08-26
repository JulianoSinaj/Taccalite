import { describe, it, expect } from "vitest";
import { isValidPartitaIva, normalisePartitaIva, partitaIvaError, sellerIdentityProblems } from "@/lib/fiscal-id";
import { settingInput } from "@/lib/validation/admin";

/**
 * The seller's Partita IVA is copied verbatim into
 * `CedentePrestatore/IdFiscaleIVA/IdCodice` of every FatturaPA XML, and the SdI
 * rejects a document whose check digit does not add up. The invoice route used
 * to test only for *presence*, so `scripts/seed-demo.ts`'s `11111111111` — whose
 * check digit should be 5 — produced a complete, invalid invoice.
 */
describe("isValidPartitaIva", () => {
  it("accepts numbers whose check digit adds up", () => {
    // 1+3+5+7+9 = 25 for the odd places; 2,4,6,8,0 doubled (4,8,3,7,0) = 22;
    // 47 → check digit 3, which is what the number carries.
    expect(isValidPartitaIva("12345678903")).toBe(true);
    expect(isValidPartitaIva("00743110157")).toBe(true);
  });

  it("rejects the demo placeholder", () => {
    expect(isValidPartitaIva("11111111111")).toBe(false);
  });

  it("rejects all-zeros, which satisfies the arithmetic but is not issued", () => {
    expect(isValidPartitaIva("00000000000")).toBe(false);
  });

  it("rejects the wrong length and non-digits", () => {
    expect(isValidPartitaIva("1234567890")).toBe(false);
    expect(isValidPartitaIva("123456789031")).toBe(false);
    expect(isValidPartitaIva("1234567890X")).toBe(false);
    expect(isValidPartitaIva("")).toBe(false);
  });

  it("tolerates how people actually type it", () => {
    expect(normalisePartitaIva(" IT 123 456 789.03 ")).toBe("12345678903");
    expect(isValidPartitaIva("IT12345678903")).toBe(true);
    expect(isValidPartitaIva(" 12345678903 ")).toBe(true);
  });
});

describe("partitaIvaError", () => {
  it("says nothing about a blank value — the invoice route is what insists", () => {
    expect(partitaIvaError("")).toBeNull();
    expect(partitaIvaError("   ")).toBeNull();
  });

  it("names the actual problem, in Italian", () => {
    expect(partitaIvaError("123")).toMatch(/11 cifre.*3/);
    expect(partitaIvaError("1234567890X")).toMatch(/non numerici/i);
    expect(partitaIvaError("11111111111")).toMatch(/codice di controllo/i);
    expect(partitaIvaError("12345678903")).toBeNull();
  });
});

describe("the settings form refuses a bad Partita IVA at the point of entry", () => {
  const save = (key: string, value: string) => settingInput.safeParse({ key, value, valueType: "text" });

  it("blocks an invalid business.vatNumber", () => {
    const r = save("business.vatNumber", "11111111111");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/codice di controllo/i);
  });

  it("allows a valid one, and blank while the shop is still being set up", () => {
    expect(save("business.vatNumber", "12345678903").success).toBe(true);
    expect(save("business.vatNumber", "").success).toBe(true);
  });

  it("leaves every other setting alone", () => {
    // The screen is a generic key/value editor: the rule must not leak onto keys
    // that merely hold digits.
    expect(save("store.shippingCents", "11111111111").success).toBe(true);
    expect(save("business.legalName", "Norcineria Taccalite S.r.l.").success).toBe(true);
  });
});

describe("sellerIdentityProblems", () => {
  const complete = {
    legalName: "Norcineria Taccalite S.r.l.",
    vatNumber: "12345678903",
    address: "Piazza Kennedy 10",
    zip: "60122",
    city: "Ancona",
    province: "AN",
  };

  it("passes a complete identity", () => {
    expect(sellerIdentityProblems(complete)).toEqual([]);
  });

  it("catches the empty Sede that every invoice was carrying", () => {
    // `business.address/.zip/.city/.province` have no defaults and were never
    // set, so the generated XML held <Indirizzo></Indirizzo> and an empty <CAP>
    // — mandatory elements, present but blank, refused by the SdI.
    const p = sellerIdentityProblems({ ...complete, address: "", zip: "", city: "", province: "" });
    expect(p).toHaveLength(4);
    // `[\s\S]` rather than `.` under the `s` flag: tsconfig targets ES2017 and
    // dotAll is ES2018, so the flag is a compile error — and because
    // `next build` type-checks, it failed the production build outright.
    expect(p.join(" ")).toMatch(/Indirizzo[\s\S]*CAP[\s\S]*Comune[\s\S]*Provincia/);
  });

  it("reports every problem at once, not the first", () => {
    // One rejection per missing field is exactly the experience this avoids.
    const p = sellerIdentityProblems({ legalName: "", vatNumber: "", address: "", zip: "", city: "", province: "" });
    expect(p.length).toBeGreaterThanOrEqual(6);
  });

  it("checks the shape of CAP and provincia, not just their presence", () => {
    expect(sellerIdentityProblems({ ...complete, zip: "601" }).join()).toMatch(/5 cifre/);
    expect(sellerIdentityProblems({ ...complete, province: "Ancona" }).join()).toMatch(/due lettere/);
  });

  it("still catches a checksum-invalid VAT number here too", () => {
    expect(sellerIdentityProblems({ ...complete, vatNumber: "11111111111" }).join()).toMatch(
      /codice di controllo/i,
    );
  });
});
