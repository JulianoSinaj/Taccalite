import { getSetting } from "@/lib/db/queries";

/**
 * Shipping carriers, and how to turn a tracking number into a link.
 *
 * `orders.carrier` is free text typed by hand on every shipment, so the same
 * courier arrived as "BRT", "Brt" and "B.R.T." — and the tracking number reached
 * the customer as a bare string in one email line, with nothing to click and
 * nowhere else on the site showing it at all.
 *
 * The list is a setting rather than a constant because couriers are a commercial
 * decision the shop changes without a deploy, and because only the shop knows the
 * tracking URL its own account uses. The stored format is one carrier per line:
 *
 *     BRT | https://vas.brt.it/vas/tracking?codice={codice}
 *     Poste Italiane
 *
 * The URL is optional — a carrier with none still normalises the name and still
 * appears in the picker; its tracking number just renders as text, exactly as
 * every carrier did before.
 */

export type Carrier = {
  name: string;
  /** Tracking URL with a `{codice}` placeholder, or null when not configured. */
  urlTemplate: string | null;
};

/** Couriers an Italian food shop is likely to use. Names only: a wrong URL sends
 *  a customer to a 404, so the templates are left for the shop to paste from its
 *  own carrier account. */
export const DEFAULT_CARRIERS_TEXT = [
  "BRT",
  "GLS",
  "SDA",
  "Poste Italiane",
  "DHL",
  "UPS",
  "TNT",
  "InPost",
].join("\n");

/** Parse the stored setting. Tolerant by design: a malformed line degrades to a
 *  name-only carrier rather than breaking the shipping form. */
export function parseCarriers(raw: string): Carrier[] {
  const out: Carrier[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [namePart, ...urlParts] = trimmed.split("|");
    const name = namePart.trim();
    if (!name) continue;
    // Rejoin: a URL may legitimately contain a pipe in a query string.
    const url = urlParts.join("|").trim();
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, urlTemplate: url || null });
  }
  return out;
}

export async function getCarriers(): Promise<Carrier[]> {
  const raw = await getSetting<string>("store.carriers", DEFAULT_CARRIERS_TEXT);
  return parseCarriers(typeof raw === "string" ? raw : DEFAULT_CARRIERS_TEXT);
}

/**
 * The tracking URL for a shipment, or null when the carrier is unknown or has no
 * template. Carrier matching is case- and spacing-insensitive so an order saved
 * as "brt" before the picker existed still resolves.
 */
export function trackingUrl(
  carriers: Carrier[],
  carrier: string | null | undefined,
  code: string | null | undefined,
): string | null {
  if (!carrier || !code) return null;
  const key = carrier.trim().toLowerCase();
  const match = carriers.find((c) => c.name.trim().toLowerCase() === key);
  if (!match?.urlTemplate) return null;
  // `{code}` accepted alongside `{codice}` — the docs are Italian but the
  // template is usually pasted from an English carrier help page.
  return match.urlTemplate
    .replace(/\{codice\}/gi, encodeURIComponent(code.trim()))
    .replace(/\{code\}/gi, encodeURIComponent(code.trim()));
}

/** Convenience for the one-shot server callers that don't already hold the list. */
export async function trackingUrlFor(
  carrier: string | null | undefined,
  code: string | null | undefined,
): Promise<string | null> {
  if (!carrier || !code) return null;
  return trackingUrl(await getCarriers(), carrier, code);
}
