/**
 * Best-effort "is this shop open right now?" for the freeform `hours` data.
 *
 * Shop hours are stored as `{ label, value }[]` where both fields are
 * human-authored Italian text, e.g.
 *   { label: "Lun–Ven", value: "9:00–13:00, 16:00–20:00" }
 *   { label: "Sabato",  value: "9:00–13:00" }
 *   { label: "Domenica", value: "Chiuso" }
 *
 * Because the data is freeform, this module MUST fail safe: whenever a label or
 * value cannot be confidently parsed we return `null` so the caller renders
 * nothing rather than showing a wrong "Aperto"/"Chiuso" badge. It never throws.
 *
 * Server-safe and dependency-free (pure functions over strings + Date).
 */

export type HoursRow = { label: string; value: string };

export type OpenState = {
  /** Whether `now` falls inside one of today's opening ranges. */
  open: boolean;
  /** Best-effort next boundary as "HH:MM" (closing time if open, next opening
   *  time if closed today). Omitted when it can't be determined. */
  nextChange?: string;
};

/** ISO weekday for a Date: Monday = 1 … Sunday = 7 (Italian week ordering). */
function isoWeekday(d: Date): number {
  const js = d.getDay(); // 0 = Sunday … 6 = Saturday
  return js === 0 ? 7 : js;
}

// Day-name prefixes → ISO weekday. Prefixes are enough to catch both the
// abbreviated ("Lun") and full ("Lunedì") Italian forms. No two entries share a
// 3-letter prefix, so first match wins safely.
const DAY_PREFIXES: [RegExp, number][] = [
  [/^lun/, 1], // Lunedì
  [/^mar/, 2], // Martedì
  [/^mer/, 3], // Mercoledì
  [/^gio/, 4], // Giovedì
  [/^ven/, 5], // Venerdì
  [/^sab/, 6], // Sabato
  [/^dom/, 7], // Domenica
];

/** Map a single day token (already trimmed/lowercased) to an ISO weekday. */
function dayFromToken(token: string): number | null {
  // Strip leading connectors like "dal"/"al"/"il" that may precede a day name.
  const t = token.replace(/^(dal|al|il|la|di|da|a)\s+/, "").trim();
  for (const [re, n] of DAY_PREFIXES) {
    if (re.test(t)) return n;
  }
  return null;
}

/** Inclusive weekday range in Italian week order (Mon→Sun), wrapping if needed. */
function weekdayRange(start: number, end: number): number[] {
  const out: number[] = [];
  let cur = start;
  // Guard against runaway loops (max 7 iterations).
  for (let i = 0; i < 7; i++) {
    out.push(cur);
    if (cur === end) break;
    cur = cur === 7 ? 1 : cur + 1;
  }
  return out;
}

/**
 * Parse a label like "Lun–Ven", "Sabato", "Lun, Mar, Mer" or "Tutti i giorni"
 * into the set of ISO weekdays it covers. Returns null when nothing recognizable
 * is found (caller then treats the row as non-matching).
 */
function parseDaysFromLabel(label: string): Set<number> | null {
  const norm = label.toLowerCase().trim();
  if (!norm) return null;

  // "Every day" phrasings.
  if (/tutti i giorni|tutti i gg|ogni giorno|7\s*\/\s*7|sempre aperto/.test(norm)) {
    return new Set([1, 2, 3, 4, 5, 6, 7]);
  }

  const days = new Set<number>();
  // Split comma/slash/"e"-separated groups, then handle each as a single day or
  // a dash/"to"-separated range.
  for (const part of norm.split(/\s*[,/]\s*|\s+e\s+/)) {
    const seg = part.trim();
    if (!seg) continue;
    const tokens = seg.split(/\s*[–—-]\s*|\s+to\s+|\s+al\s+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) continue;
    const first = dayFromToken(tokens[0]);
    const last = dayFromToken(tokens[tokens.length - 1]);
    if (tokens.length >= 2 && first != null && last != null) {
      for (const d of weekdayRange(first, last)) days.add(d);
    } else if (first != null) {
      days.add(first);
    }
    // Unrecognized tokens are ignored (defensive) — a fully unrecognized label
    // simply yields an empty set below.
  }

  return days.size > 0 ? days : null;
}

/** Parse "HH:MM" / "H:MM" / "H" into minutes-since-midnight, or null. */
function parseTimeToMinutes(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

type TimeRange = { start: number; end: number };

/**
 * Parse a value like "9:00–13:00, 16:00–20:00" into time ranges. Returns null on
 * any failure (no ranges at all). "Chiuso" is signalled separately by the caller.
 */
function parseRanges(value: string): TimeRange[] | null {
  const ranges: TimeRange[] = [];
  for (const part of value.split(/\s*[,;/]\s*/)) {
    const seg = part.trim();
    if (!seg) continue;
    const ends = seg.split(/\s*[–—-]\s*|\s+alle?\s+|\s+to\s+/).map((s) => s.trim());
    if (ends.length !== 2) return null; // ambiguous / unparseable segment
    const start = parseTimeToMinutes(ends[0]);
    const end = parseTimeToMinutes(ends[1]);
    if (start == null || end == null) return null;
    ranges.push({ start, end });
  }
  return ranges.length > 0 ? ranges : null;
}

/** Format minutes-since-midnight as "HH:MM" (24 wraps to 00:00 for display). */
function fmt(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// ── Structured hours ─────────────────────────────────────────────────────────
/**
 * The authoritative shape, when a shop has been migrated off free text: one
 * entry per weekday (1 = Monday … 7 = Sunday) with zero or more ranges. An entry
 * with an empty `ranges` array means *explicitly closed*, which is information —
 * unlike a missing entry, which means "not configured".
 */
export type DayHours = { day: number; ranges: { open: string; close: string }[] };

const ITALIAN_DAYS = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

/** Italian name of an ISO weekday (1 = Monday). */
export const weekdayName = (day: number) => ITALIAN_DAYS[day] ?? "";

/**
 * Validate and normalise structured hours coming from the admin editor.
 *
 * Returns null for anything unusable, so a malformed payload leaves the shop on
 * its free-text hours rather than half-applying. Ranges are sorted and each is
 * checked for a real HH:MM pair; a close time at or before its open time is
 * dropped (an overnight range is not something a norcineria needs, and silently
 * accepting one would render as "open all night").
 */
export function parseStructuredHours(raw: string | null | undefined): DayHours[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const out: DayHours[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { day?: unknown; ranges?: unknown };
    const day = Number(e.day);
    if (!Number.isInteger(day) || day < 1 || day > 7) continue;
    if (out.some((d) => d.day === day)) continue; // first entry per day wins

    const ranges: { open: string; close: string }[] = [];
    if (Array.isArray(e.ranges)) {
      for (const r of e.ranges) {
        if (!r || typeof r !== "object") continue;
        const rr = r as { open?: unknown; close?: unknown };
        const open = parseTimeToMinutes(String(rr.open ?? ""));
        const close = parseTimeToMinutes(String(rr.close ?? ""));
        if (open == null || close == null || close <= open) continue;
        ranges.push({ open: fmt(open), close: fmt(close) });
      }
    }
    ranges.sort((a, b) => a.open.localeCompare(b.open));
    out.push({ day, ranges });
  }

  out.sort((a, b) => a.day - b.day);
  return out.length > 0 ? out : null;
}

/**
 * Render structured hours as the `{label, value}` rows the public pages and the
 * existing free-text field display, collapsing consecutive days that share the
 * same schedule ("Lun–Ven · 9:00–13:00, 16:00–20:00").
 *
 * Keeping the display derived means the admin edits data once and the prose
 * can't drift away from it — which is exactly how the free-text version went
 * wrong.
 */
export function structuredToRows(hours: DayHours[]): HoursRow[] {
  const key = (d: DayHours) => d.ranges.map((r) => `${r.open}–${r.close}`).join(", ") || "Chiuso";
  const byDay = new Map(hours.map((d) => [d.day, d]));

  const rows: HoursRow[] = [];
  let runStart: number | null = null;
  let runKey = "";

  const flush = (endDay: number) => {
    if (runStart == null) return;
    const label =
      runStart === endDay ? weekdayName(runStart) : `${weekdayName(runStart).slice(0, 3)}–${weekdayName(endDay).slice(0, 3)}`;
    rows.push({ label, value: runKey });
    runStart = null;
  };

  for (let day = 1; day <= 7; day++) {
    const entry = byDay.get(day);
    if (!entry) {
      flush(day - 1);
      continue;
    }
    const k = key(entry);
    if (runStart == null) {
      runStart = day;
      runKey = k;
    } else if (k !== runKey) {
      flush(day - 1);
      runStart = day;
      runKey = k;
    }
  }
  flush(7);
  return rows;
}

/** Open/closed from structured hours. Never guesses — the data is exact. */
function isOpenNowStructured(hours: DayHours[], now: Date): OpenState | null {
  const today = hours.find((d) => d.day === isoWeekday(now));
  if (!today) return null; // day not configured — say nothing
  if (today.ranges.length === 0) return { open: false };

  const cur = now.getHours() * 60 + now.getMinutes();
  const mins = (t: string) => parseTimeToMinutes(t) ?? 0;

  for (const r of today.ranges) {
    const start = mins(r.open);
    const end = mins(r.close);
    if (cur >= start && cur < end) return { open: true, nextChange: r.close };
  }
  const next = today.ranges.map((r) => mins(r.open)).filter((s) => s > cur).sort((a, b) => a - b)[0];
  return next != null ? { open: false, nextChange: fmt(next) } : { open: false };
}

/**
 * Open/closed for a shop, preferring structured hours and falling back to the
 * free-text parser for shops not yet migrated.
 */
export function shopIsOpenNow(
  shop: { hours: HoursRow[] | null; hoursStructured?: DayHours[] | null },
  now: Date = new Date(),
): OpenState | null {
  try {
    if (shop.hoursStructured && shop.hoursStructured.length > 0) {
      return isOpenNowStructured(shop.hoursStructured, now);
    }
    return isOpenNow(shop.hours, now);
  } catch {
    return null;
  }
}

/** The rows to display for a shop: derived from structured hours when present. */
export function shopHoursRows(shop: {
  hours: HoursRow[] | null;
  hoursStructured?: DayHours[] | null;
}): HoursRow[] {
  if (shop.hoursStructured && shop.hoursStructured.length > 0) {
    return structuredToRows(shop.hoursStructured);
  }
  return shop.hours ?? [];
}

/**
 * Best-effort open/closed check against the freeform hours.
 *
 * @returns `{ open, nextChange? }` when today's row could be parsed, or `null`
 *   when no row matches today or the matching value can't be parsed. Callers
 *   MUST render nothing on `null` — never guess.
 */
export function isOpenNow(hours: HoursRow[] | null | undefined, now: Date = new Date()): OpenState | null {
  try {
    if (!Array.isArray(hours) || hours.length === 0) return null;
    const today = isoWeekday(now);

    // Find the first row whose label covers today.
    const row = hours.find((h) => {
      if (!h || typeof h.label !== "string") return false;
      const set = parseDaysFromLabel(h.label);
      return set != null && set.has(today);
    });
    if (!row || typeof row.value !== "string") return null;

    const value = row.value.trim();
    // Explicit closed marker — a safe, non-guessing interpretation.
    if (/\bchius/i.test(value)) return { open: false };

    const ranges = parseRanges(value);
    if (!ranges) return null; // fail safe — don't guess

    const cur = now.getHours() * 60 + now.getMinutes();
    for (const { start, end } of ranges) {
      // Normal same-day range.
      if (end > start) {
        if (cur >= start && cur < end) return { open: true, nextChange: fmt(end) };
      } else if (end < start) {
        // Overnight range (e.g. 20:00–02:00): open if after start or before end.
        if (cur >= start || cur < end) return { open: true, nextChange: fmt(end) };
      }
    }

    // Closed now: surface the next opening time that is still ahead today.
    const upcoming = ranges
      .map((r) => r.start)
      .filter((s) => s > cur)
      .sort((a, b) => a - b)[0];
    return upcoming != null ? { open: false, nextChange: fmt(upcoming) } : { open: false };
  } catch {
    // Never let malformed data crash a page render.
    return null;
  }
}

/**
 * Index of the first `hours` row whose label covers `now`'s weekday, or -1 when
 * no row matches / the data is unparseable. Lets a full weekly table highlight
 * "today" without duplicating the label-parsing rules above. Never throws.
 */
export function todayRowIndex(hours: HoursRow[] | null | undefined, now: Date = new Date()): number {
  try {
    if (!Array.isArray(hours) || hours.length === 0) return -1;
    const today = isoWeekday(now);
    return hours.findIndex((h) => {
      if (!h || typeof h.label !== "string") return false;
      const set = parseDaysFromLabel(h.label);
      return set != null && set.has(today);
    });
  } catch {
    return -1;
  }
}
