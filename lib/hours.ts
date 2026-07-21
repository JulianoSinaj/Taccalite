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
