/**
 * Days the shop is shut, and what that stops.
 *
 * Everything else that decided whether a day was bookable was *weekly*:
 * `shops.hoursStructured` names the open weekdays, `pickup_slots` recurs by
 * weekday, and the public reservation form accepted any date at all. So the
 * calendar — Ferragosto, Christmas, a refit, a funeral — had no representation
 * anywhere, and the only lever was the global "prenotazioni attive" switch,
 * which also closes the days either side of the one you meant.
 *
 * Deliberately isomorphic (no `server-only`, no db import): the browser filters
 * the pickup windows it offers with the identical function the server refuses
 * with, the way `lib/fulfilment.ts` already does for delivery zones. The rows
 * come from the caller.
 */

/** The shape both `shop_closures` rows and a client-serialised copy satisfy. */
export type ClosureLike = {
  /** Null = every location. */
  shopSlug: string | null;
  fromDate: string; // ISO yyyy-mm-dd, inclusive
  toDate: string; // ISO yyyy-mm-dd, inclusive
  reason: string;
  blocksReservations: boolean;
  blocksPickup: boolean;
};

/** Which service a date is being tested for. */
export type ClosureKind = "reservations" | "pickup";

const blocks = (c: ClosureLike, kind: ClosureKind): boolean =>
  kind === "reservations" ? c.blocksReservations : c.blocksPickup;

/**
 * The closure covering `date` at `shopSlug` for `kind`, or null.
 *
 * A row with a null `shopSlug` applies everywhere, so a company-wide shutdown
 * is one record rather than one per location. ISO dates compare correctly as
 * strings, which is why the bounds are stored as text and not as instants — a
 * closure is a run of calendar days, not an interval of time, and must not
 * shift by an hour twice a year.
 */
export function closureFor(
  closures: ClosureLike[],
  shopSlug: string | null | undefined,
  date: string,
  kind: ClosureKind,
): ClosureLike | null {
  for (const c of closures) {
    if (!blocks(c, kind)) continue;
    if (c.shopSlug != null && c.shopSlug !== shopSlug) continue;
    if (date < c.fromDate || date > c.toDate) continue;
    return c;
  }
  return null;
}

/** Convenience predicate for the callers that only need yes/no. */
export function isClosed(
  closures: ClosureLike[],
  shopSlug: string | null | undefined,
  date: string,
  kind: ClosureKind,
): boolean {
  return closureFor(closures, shopSlug, date, kind) != null;
}

/**
 * The sentence shown to a customer whose date was refused.
 *
 * The reason is optional on the record because "chiuso" is often the whole
 * truth; when there is one it is the more useful half of the message, so it
 * leads.
 */
export function closureMessage(c: ClosureLike, date: string): string {
  const when = c.fromDate === c.toDate ? `il ${fmtDay(date)}` : `dal ${fmtDay(c.fromDate)} al ${fmtDay(c.toDate)}`;
  return c.reason
    ? `Siamo chiusi ${when}: ${c.reason}. Scegli un'altra data.`
    : `Siamo chiusi ${when}. Scegli un'altra data.`;
}

/** "26 luglio 2026" — no timezone conversion, the date is already local. */
function fmtDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Every ISO date a set of closures covers between `from` and `to`, for one
 * location and one service — what a date picker needs in order to grey days out
 * rather than let them be chosen and then refused.
 *
 * Bounded by `to` so an open-ended August range can't be expanded into an
 * unbounded list.
 */
export function closedDatesBetween(
  closures: ClosureLike[],
  shopSlug: string | null | undefined,
  from: string,
  to: string,
  kind: ClosureKind,
): string[] {
  const out: string[] = [];
  for (const c of closures) {
    if (!blocks(c, kind)) continue;
    if (c.shopSlug != null && c.shopSlug !== shopSlug) continue;
    const start = c.fromDate > from ? c.fromDate : from;
    const end = c.toDate < to ? c.toDate : to;
    if (start > end) continue;
    for (let d = start; d <= end; d = nextDay(d)) out.push(d);
  }
  return Array.from(new Set(out)).sort();
}

/** The day after `isoDate`. UTC arithmetic, so DST can never skip or repeat one. */
function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
