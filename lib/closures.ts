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
  /**
   * Part of each day only, `HH:MM` both or neither. Optional so the rows
   * serialised before the column existed still satisfy the type.
   */
  startTime?: string | null;
  endTime?: string | null;
};

/** Which service a date is being tested for. */
export type ClosureKind = "reservations" | "pickup";

/**
 * The moment being tested against a partial-day closure: a booking's time, or a
 * pickup window's bounds. Omitted for a date-only question, which a partial
 * closure never answers "closed" to — the day is still open the rest of the time.
 */
export type ClosureAt = string | { start: string; end: string };

const blocks = (c: ClosureLike, kind: ClosureKind): boolean =>
  kind === "reservations" ? c.blocksReservations : c.blocksPickup;

/** Whole-day closure, as opposed to a time window inside each day. */
export function isWholeDay(c: ClosureLike): boolean {
  return !c.startTime || !c.endTime;
}

/** Does the closure's time window catch `at`? Whole-day closures catch everything. */
function coversTime(c: ClosureLike, at: ClosureAt | undefined): boolean {
  if (isWholeDay(c)) return true;
  if (at == null) return false;
  const start = c.startTime!;
  const end = c.endTime!;
  // HH:MM strings compare correctly as text. The window is half-open, so a
  // booking exactly at the reopening minute is allowed.
  if (typeof at === "string") return at >= start && at < end;
  return at.start < end && at.end > start;
}

/**
 * The closure covering `date` at `shopSlug` for `kind`, or null.
 *
 * A row with a null `shopSlug` applies everywhere, so a company-wide shutdown
 * is one record rather than one per location. ISO dates compare correctly as
 * strings, which is why the bounds are stored as text and not as instants — a
 * closure is a run of calendar days, not an interval of time, and must not
 * shift by an hour twice a year.
 *
 * Whole-day closures win over partial ones when both cover the date, so the
 * message the customer sees is the one that actually explains the refusal.
 */
export function closureFor(
  closures: ClosureLike[],
  shopSlug: string | null | undefined,
  date: string,
  kind: ClosureKind,
  at?: ClosureAt,
): ClosureLike | null {
  let partial: ClosureLike | null = null;
  for (const c of closures) {
    if (!blocks(c, kind)) continue;
    if (c.shopSlug != null && c.shopSlug !== shopSlug) continue;
    if (date < c.fromDate || date > c.toDate) continue;
    if (isWholeDay(c)) return c;
    if (!partial && coversTime(c, at)) partial = c;
  }
  return partial;
}

/** Convenience predicate for the callers that only need yes/no. */
export function isClosed(
  closures: ClosureLike[],
  shopSlug: string | null | undefined,
  date: string,
  kind: ClosureKind,
  at?: ClosureAt,
): boolean {
  return closureFor(closures, shopSlug, date, kind, at) != null;
}

/**
 * Every closure of `kind` that touches `date` at `shopSlug`, whole-day and
 * partial alike — what a calendar cell needs in order to label the day rather
 * than refuse a booking on it.
 */
export function closuresOn(
  closures: ClosureLike[],
  shopSlug: string | null | undefined,
  date: string,
  kind: ClosureKind,
): ClosureLike[] {
  return closures.filter(
    (c) =>
      blocks(c, kind) &&
      (c.shopSlug == null || c.shopSlug === shopSlug) &&
      date >= c.fromDate &&
      date <= c.toDate,
  );
}

/** Where a closure sits relative to `today`. */
export type ClosureStatus = "past" | "ongoing" | "upcoming";

export function closureStatus(c: ClosureLike, today: string): ClosureStatus {
  if (c.toDate < today) return "past";
  if (c.fromDate <= today) return "ongoing";
  return "upcoming";
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
  const hours = isWholeDay(c) ? "" : ` ${closureTimeLabel(c)}`;
  return c.reason
    ? `Siamo chiusi ${when}${hours}: ${c.reason}. Scegli un'altra data.`
    : `Siamo chiusi ${when}${hours}. Scegli un'altra data.`;
}

/** "il 15 agosto 2026" / "dal 10 al 24 agosto 2026" — for prose. */
export function closureRangeLabel(c: Pick<ClosureLike, "fromDate" | "toDate">): string {
  return c.fromDate === c.toDate ? `il ${fmtDay(c.fromDate)}` : `dal ${fmtDay(c.fromDate)} al ${fmtDay(c.toDate)}`;
}

/** "dalle 14:00 alle 18:00", or "" for a whole-day closure. */
export function closureTimeLabel(c: ClosureLike): string {
  return isWholeDay(c) ? "" : `dalle ${c.startTime} alle ${c.endTime}`;
}

/** "26 luglio 2026" — no timezone conversion, the date is already local. */
export function fmtDay(isoDate: string, opts: { weekday?: boolean } = {}): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", {
    timeZone: "UTC",
    weekday: opts.weekday ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Whole days a range covers, inclusive of both ends. */
export function dayCount(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Every ISO date a set of closures covers between `from` and `to`, for one
 * location and one service — what a date picker needs in order to grey days out
 * rather than let them be chosen and then refused.
 *
 * Partial-day closures are left out: the day is still bookable outside the
 * window, and greying it would turn "chiusi il pomeriggio" into "chiusi".
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
    if (!isWholeDay(c)) continue;
    if (c.shopSlug != null && c.shopSlug !== shopSlug) continue;
    const start = c.fromDate > from ? c.fromDate : from;
    const end = c.toDate < to ? c.toDate : to;
    if (start > end) continue;
    for (let d = start; d <= end; d = shiftDay(d, 1)) out.push(d);
  }
  return Array.from(new Set(out)).sort();
}

/** `isoDate` shifted by whole days. UTC arithmetic, so DST can never skip or repeat one. */
export function shiftDay(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The same calendar date one year on. 29 February lands on 28 February, which
 * is what "the same closure next year" means for a leap-day row.
 */
export function sameDayNextYear(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const probe = new Date(Date.UTC(y + 1, m - 1, d));
  if (probe.getUTCMonth() !== m - 1) return new Date(Date.UTC(y + 1, m - 1, d - 1)).toISOString().slice(0, 10);
  return probe.toISOString().slice(0, 10);
}
