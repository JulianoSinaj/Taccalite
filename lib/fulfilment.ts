/**
 * How an order reaches the customer, and what that costs.
 *
 * Deliberately isomorphic — no `server-only`, no DB, no `Date` — because the
 * checkout has to show the customer the same number the server will charge, and
 * the only way to guarantee that is for both to run this code. The server is
 * still authoritative: it re-quotes from its own zone rows on submit and ignores
 * anything the client sent.
 *
 * The model this replaces was a single `store.shippingCents` applied to the whole
 * of Italy, with `pickup | shipping` as the only two options — so a 4 kg
 * porchetta and a jar of sugo cost the same to send, an order to the next street
 * cost the same as one to Palermo, and the shop's own van round could not be
 * offered at all.
 */

export const FULFILMENT_MODES = ["pickup", "delivery", "shipping"] as const;
export type FulfilmentMode = (typeof FULFILMENT_MODES)[number];

export const FULFILMENT_LABEL: Record<FulfilmentMode, string> = {
  pickup: "Ritiro in bottega",
  delivery: "Consegna a domicilio",
  shipping: "Spedizione",
};

/** Column-width version for tables and badges. */
export const FULFILMENT_SHORT: Record<FulfilmentMode, string> = {
  pickup: "Ritiro",
  delivery: "Consegna",
  shipping: "Spedizione",
};

/** ISO weekday names, 1 = Monday, matching `shops.hoursStructured`. */
export const WEEKDAY_NAME: Record<number, string> = {
  1: "lunedì",
  2: "martedì",
  3: "mercoledì",
  4: "giovedì",
  5: "venerdì",
  6: "sabato",
  7: "domenica",
};

/** True for the two modes that need an address and a zone. */
export function needsAddress(mode: FulfilmentMode): mode is "delivery" | "shipping" {
  return mode === "delivery" || mode === "shipping";
}

export function isFulfilmentMode(v: unknown): v is FulfilmentMode {
  return typeof v === "string" && (FULFILMENT_MODES as readonly string[]).includes(v);
}

/**
 * Italian CAPs are five digits. Customers type them with spaces, dots and the
 * occasional "I-" prefix, so everything that isn't a digit goes.
 */
export function normalizeCap(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D+/g, "").slice(0, 5);
}

/** The shape zone matching needs — structural, so a Drizzle row satisfies it. */
export type ZoneLike = {
  id: string;
  name: string;
  mode: "delivery" | "shipping";
  postcodes: string[];
  shopSlug: string | null;
  feeCents: number;
  freeOverCents: number | null;
  minOrderCents: number;
  perKgCents: number | null;
  leadTimeHours: number;
  note: string;
  sortOrder: number;
  active: boolean;
};

/**
 * How specifically a zone claims a CAP: an exact code beats a long prefix beats
 * a short one beats the catch-all. Returns -1 when the zone doesn't cover it.
 *
 * The ordering matters more than it looks: "Ancona centro" (60121) and
 * "Provincia di Ancona" (60) and "Resto d'Italia" (empty) all match 60121, and
 * the customer must be quoted the first one. Sorting zones by hand would have
 * made that the operator's problem.
 */
export function zoneSpecificity(zone: ZoneLike, cap: string): number {
  const codes = zone.postcodes.map(normalizeCap).filter(Boolean);
  if (codes.length === 0) return 0; // catch-all
  let best = -1;
  for (const code of codes) {
    if (code === cap) best = Math.max(best, 10);
    else if (cap.startsWith(code)) best = Math.max(best, code.length);
  }
  return best;
}

/** The zone that serves `cap` for `mode`, or null when nowhere does. */
export function matchZone<T extends ZoneLike>(zones: T[], cap: string, mode: "delivery" | "shipping"): T | null {
  let winner: T | null = null;
  let winning = -1;
  for (const z of zones) {
    if (!z.active || z.mode !== mode) continue;
    const score = zoneSpecificity(z, cap);
    if (score < 0) continue;
    if (
      score > winning ||
      (score === winning &&
        winner !== null &&
        (z.sortOrder < winner.sortOrder ||
          (z.sortOrder === winner.sortOrder && z.name.localeCompare(winner.name) < 0)))
    ) {
      winner = z;
      winning = score;
    }
  }
  return winner;
}

export type FulfilmentQuote = {
  /** What to charge for carriage, in cents. */
  feeCents: number;
  zone: ZoneLike | null;
  /** Set when the order cannot be placed as asked. Customer-facing Italian. */
  error: string | null;
  /** True when a fee was owed and then waived (threshold or coupon). */
  freeApplied: boolean;
};

const euros = (cents: number) => `€${(cents / 100).toFixed(2).replace(".", ",")}`;

/**
 * Price carriage for one order.
 *
 * Pickup is free and needs no zone. Delivery and shipping each resolve their own
 * zone from the CAP — a zone list can serve both, and a CAP covered for courier
 * shipping is very often not covered by the van.
 */
export function quoteFulfilment(input: {
  mode: FulfilmentMode;
  subtotalCents: number;
  zones: ZoneLike[];
  cap?: string | null;
  /** Weight of the goods sold by weight, for `perKgCents` zones. */
  weightKg?: number;
  /** A `free_shipping` coupon waives the fee but not the minimum order. */
  freeShippingCoupon?: boolean;
}): FulfilmentQuote {
  const none = { feeCents: 0, zone: null, error: null, freeApplied: false };
  if (input.mode === "pickup") return none;

  const cap = normalizeCap(input.cap);
  if (cap.length < 5) {
    return { ...none, error: "Inserisci un CAP valido di 5 cifre." };
  }

  const zone = matchZone(input.zones, cap, input.mode);
  if (!zone) {
    return {
      ...none,
      error:
        input.mode === "delivery"
          ? `Non effettuiamo consegne a domicilio al CAP ${cap}. Puoi scegliere la spedizione o il ritiro in bottega.`
          : `Non spediamo al CAP ${cap}. Scrivici e troviamo una soluzione.`,
    };
  }

  if (input.subtotalCents < zone.minOrderCents) {
    return {
      feeCents: 0,
      zone,
      freeApplied: false,
      error: `Ordine minimo di ${euros(zone.minOrderCents)} per «${zone.name}» (mancano ${euros(
        zone.minOrderCents - input.subtotalCents,
      )}).`,
    };
  }

  // The per-kg surcharge applies to the weighed goods only: a zone that charges
  // by weight is charging for the porchetta, not for the jar of sugo next to it.
  const perKg = zone.perKgCents ?? 0;
  const weight = Math.max(0, input.weightKg ?? 0);
  const gross = zone.feeCents + Math.round(perKg * weight);

  const free =
    !!input.freeShippingCoupon ||
    (zone.freeOverCents != null && input.subtotalCents >= zone.freeOverCents);

  return { feeCents: free ? 0 : gross, zone, error: null, freeApplied: free && gross > 0 };
}

/**
 * Weight of the goods that a per-kg zone charges for.
 *
 * `order_items.weightKg` is set for counter lines weighed on the scale. An online
 * line has no weight, so a product sold by weight and priced per kg contributes
 * its quantity — which is what the customer bought, in kg. Anything else
 * contributes nothing rather than a guess.
 */
export function billableWeightKg(
  lines: { weightKg?: number | null; quantity: number; soldByWeight: boolean; unit?: string | null }[],
): number {
  let kg = 0;
  for (const l of lines) {
    if (l.weightKg != null) kg += l.weightKg;
    else if (l.soldByWeight && (l.unit ?? "").toLowerCase() === "kg") kg += l.quantity;
  }
  return Math.round(kg * 1000) / 1000;
}
