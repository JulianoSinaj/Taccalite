import "server-only";

/**
 * Business timezone. The shop is in Ancona, so all "today"/date-gate logic must
 * resolve against Italian local time, not the server's timezone (which is UTC in
 * the Docker image). ISO `date` columns store Italian local dates.
 */
export const BUSINESS_TZ = "Europe/Rome";

/**
 * Today's date as `yyyy-mm-dd` in the business timezone, regardless of the
 * server's own timezone. Use for every comparison against the ISO `date`
 * columns (reservations, blog publish gate, digest, reminders). Replaces the
 * previous `new Date().toISOString().slice(0,10)`, which was UTC and drifted a
 * day near midnight in Italy.
 */
export function dateInRome(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * `yyyy-mm-dd` for `days` from today in the business timezone.
 *
 * Lives here rather than in a page because the React Compiler lint forbids
 * calling `new Date()` in a render body — and every "expiring within N days"
 * surface has to agree on where the boundary falls.
 */
export function expiryWindow(days: number, date: Date = new Date()): string {
  const [y, m, d] = dateInRome(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The UTC instant of 00:00 Europe/Rome on the given moment's local date. Derived
 * by subtracting the time elapsed so far today on the Rome wall clock, so it is
 * correct across DST. Use for "since start of today" range comparisons (e.g.
 * today's revenue) so both halves of a report share one day boundary.
 */
export function startOfTodayRome(date: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some ICU builds render midnight as "24"
  const secsElapsed = hour * 3600 + get("minute") * 60 + get("second");
  return new Date(date.getTime() - secsElapsed * 1000);
}

/**
 * The UTC instant of `HH:MM` on `yyyy-mm-dd`, read as a Europe/Rome wall clock.
 *
 * Pickup windows are written the way the shop says them ("giovedì, 10:00") and
 * stored on the order as an instant, so the two have to be converted somewhere
 * that knows about CEST. Two passes: guess the offset at the naive timestamp,
 * then re-read it at the corrected one, which is what makes the hour either side
 * of a DST change come out right instead of an hour off twice a year.
 */
export function instantInRome(isoDate: string, time: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  let ts = naive - romeOffsetMs(new Date(naive));
  ts = naive - romeOffsetMs(new Date(ts));
  return new Date(ts);
}

/** How far ahead of UTC Europe/Rome is at `at`, in milliseconds. */
function romeOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  // Millisecond remainder is lost by the formatter; add it back so the result is
  // a whole-minute offset rather than one drifting by up to 999 ms.
  return asUtc - (at.getTime() - (at.getTime() % 1000));
}
