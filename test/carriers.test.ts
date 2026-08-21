import { describe, it, expect } from "vitest";
import { parseCarriers, trackingUrl, DEFAULT_CARRIERS_TEXT } from "@/lib/carriers";

describe("parseCarriers", () => {
  it("reads one carrier per line, with an optional tracking template", () => {
    expect(parseCarriers("BRT | https://esempio.it/t?n={codice}\nPoste Italiane")).toEqual([
      { name: "BRT", urlTemplate: "https://esempio.it/t?n={codice}" },
      { name: "Poste Italiane", urlTemplate: null },
    ]);
  });

  it("ignores blank lines and trims whitespace", () => {
    expect(parseCarriers("\n  GLS  \n\n   \n  SDA |   \n")).toEqual([
      { name: "GLS", urlTemplate: null },
      { name: "SDA", urlTemplate: null },
    ]);
  });

  it("keeps a pipe that belongs to the URL's query string", () => {
    const [c] = parseCarriers("DHL | https://esempio.it/t?a=1|2&n={codice}");
    expect(c.urlTemplate).toBe("https://esempio.it/t?a=1|2&n={codice}");
  });

  it("drops a repeated carrier rather than offering it twice", () => {
    expect(parseCarriers("BRT\nbrt | https://x/{codice}")).toHaveLength(1);
  });

  it("skips a line with no name at all", () => {
    expect(parseCarriers("| https://esempio.it/{codice}\nGLS")).toEqual([
      { name: "GLS", urlTemplate: null },
    ]);
  });

  it("parses the shipped default list", () => {
    const list = parseCarriers(DEFAULT_CARRIERS_TEXT);
    expect(list.length).toBeGreaterThan(4);
    // Names only: a guessed URL would send customers to a 404.
    expect(list.every((c) => c.urlTemplate === null)).toBe(true);
  });
});

describe("trackingUrl", () => {
  const carriers = parseCarriers("BRT | https://esempio.it/t?n={codice}\nPoste Italiane");

  it("fills the placeholder", () => {
    expect(trackingUrl(carriers, "BRT", "12345")).toBe("https://esempio.it/t?n=12345");
  });

  it("matches the carrier case- and whitespace-insensitively", () => {
    // Orders saved by hand before the picker existed hold "brt", " BRT " etc.
    expect(trackingUrl(carriers, "  brt ", "12345")).toBe("https://esempio.it/t?n=12345");
  });

  it("accepts {code} as well as {codice}", () => {
    const c = parseCarriers("UPS | https://esempio.it/t?n={code}");
    expect(trackingUrl(c, "UPS", "9")).toBe("https://esempio.it/t?n=9");
  });

  it("percent-encodes the tracking number", () => {
    expect(trackingUrl(carriers, "BRT", "AB 12/34")).toBe("https://esempio.it/t?n=AB%2012%2F34");
  });

  it("returns null when the carrier has no template, is unknown, or nothing is set", () => {
    expect(trackingUrl(carriers, "Poste Italiane", "12345")).toBeNull();
    expect(trackingUrl(carriers, "Sconosciuto", "12345")).toBeNull();
    expect(trackingUrl(carriers, "BRT", null)).toBeNull();
    expect(trackingUrl(carriers, null, "12345")).toBeNull();
  });
});
