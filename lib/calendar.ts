/**
 * Calendar arithmetic on `yyyy-mm-dd` strings.
 *
 * Everything here takes and returns the same ISO day the rest of the app stores,
 * and never touches the browser's clock: the "today" a picker highlights is
 * passed in from the server (`dateInRome()`), the way `ReservationForm` already
 * receives it, so a customer whose laptop is a day ahead sees the shop's day.
 *
 * `Date.UTC` internally, never `new Date(iso)`: a bare `yyyy-mm-dd` parses as
 * UTC midnight, so reading it back out through local getters lands a day early
 * for anyone west of Greenwich and `toISOString()` lands a day early for anyone
 * east of it. Building at UTC noon-free `Date.UTC(y, m - 1, d)` and reading only
 * `getUTC*` keeps the round trip exact in every timezone.
 */

const MONTHS_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
] as const;

const MONTHS_SHORT_IT = [
  "gen",
  "feb",
  "mar",
  "apr",
  "mag",
  "giu",
  "lug",
  "ago",
  "set",
  "ott",
  "nov",
  "dic",
] as const;

/** Monday-first, the way an Italian calendar is printed. */
const WEEKDAYS_IT = [
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
  "domenica",
] as const;

const WEEKDAYS_SHORT_IT = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"] as const;

/** The column headings. Two M's and two G-less S's is how the paper does it. */
export const WEEKDAY_INITIALS_IT = ["L", "M", "M", "G", "V", "S", "D"] as const;

export type Ymd = { y: number; m: number; d: number };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIso(iso: string | null | undefined): Ymd | null {
  const match = ISO_RE.exec(iso ?? "");
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function toIso({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Day 0 of the *next* month is the last day of this one. */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = Monday … 6 = Sunday, not the JS 0 = Sunday. */
export function mondayIndex({ y, m, d }: Ymd): number {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function addDays(ymd: Ymd, delta: number): Ymd {
  const t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  t.setUTCDate(t.getUTCDate() + delta);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * Month arithmetic that clamps the day instead of rolling over: 31 gennaio a
 * month on is 28 febbraio, not 3 marzo. A picker that jumped two months when
 * you pressed "next" once would be indistinguishable from a bug.
 */
export function addMonths(ymd: Ymd, delta: number): Ymd {
  const total = ymd.y * 12 + (ymd.m - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(ymd.d, daysInMonth(y, m)) };
}

/**
 * The 42 days a month grid shows — six full weeks from the Monday on or before
 * the 1st, so the panel is the same height every month and nothing below it
 * jumps when you page through the year.
 */
export function monthGrid(y: number, m: number): string[] {
  const first: Ymd = { y, m, d: 1 };
  const start = addDays(first, -mondayIndex(first));
  return Array.from({ length: 42 }, (_, i) => toIso(addDays(start, i)));
}

/** "Agosto 2026" — the panel's title. */
export function monthLabelIt(y: number, m: number): string {
  const name = MONTHS_IT[m - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/** "sabato 29 agosto 2026" — screen-reader labels and the closure sentences. */
export function formatLongIt(iso: string): string {
  const ymd = parseIso(iso);
  if (!ymd) return "";
  return `${WEEKDAYS_IT[mondayIndex(ymd)]} ${ymd.d} ${MONTHS_IT[ymd.m - 1]} ${ymd.y}`;
}

/** "sab 29 ago 2026" — what the closed field shows. */
export function formatMediumIt(iso: string): string {
  const ymd = parseIso(iso);
  if (!ymd) return "";
  return `${WEEKDAYS_SHORT_IT[mondayIndex(ymd)]} ${ymd.d} ${MONTHS_SHORT_IT[ymd.m - 1]} ${ymd.y}`;
}

/**
 * ISO days sort as strings — same length, biggest field first — so no parsing is
 * needed to compare them, and `min`/`max` bounds can be tested as they arrive.
 */
export function isoBefore(a: string, b: string): boolean {
  return a < b;
}

export function clampIso(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}
