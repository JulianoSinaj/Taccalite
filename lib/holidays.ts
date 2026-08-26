/**
 * The Italian national holidays, so a year's closures can be added in one go
 * instead of typed out date by date every December.
 *
 * Isomorphic and dependency-free: the list is pure calendar arithmetic, and the
 * closures page renders it as a checklist rather than inserting it blindly — a
 * food shop is very often *open* on the 8th of December, and the operator is the
 * one who knows which days the counter actually works.
 */

export type Holiday = { date: string; name: string };

/**
 * Easter Sunday for a Gregorian year — the anonymous algorithm as printed in
 * Butcher's Ecclesiastical Calendar (1876), which every later derivation
 * reduces to. Verified against 2024-03-31, 2025-04-20, 2026-04-05, 2027-03-28.
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shift(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The twelve national holidays of `year`, in calendar order. */
export function italianHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  return [
    { date: iso(year, 1, 1), name: "Capodanno" },
    { date: iso(year, 1, 6), name: "Epifania" },
    { date: easter, name: "Pasqua" },
    { date: shift(easter, 1), name: "Lunedì dell'Angelo" },
    { date: iso(year, 4, 25), name: "Festa della Liberazione" },
    { date: iso(year, 5, 1), name: "Festa del Lavoro" },
    { date: iso(year, 6, 2), name: "Festa della Repubblica" },
    { date: iso(year, 8, 15), name: "Ferragosto" },
    { date: iso(year, 11, 1), name: "Ognissanti" },
    { date: iso(year, 12, 8), name: "Immacolata Concezione" },
    { date: iso(year, 12, 25), name: "Natale" },
    { date: iso(year, 12, 26), name: "Santo Stefano" },
  ];
}
