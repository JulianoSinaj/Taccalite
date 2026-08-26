import "server-only";
import { dateInRome } from "@/lib/time";

/**
 * The date window the agenda / prep sheet covers.
 *
 * Kept out of the page for the same reason as the VAT period helper: the React
 * Compiler lint forbids `new Date()` in a component's render body, and the
 * window has to be resolved identically wherever it's read.
 *
 * Defaults to a single day (today) — the sheet is what the kitchen works from
 * this morning, and printing every future booking was never the intent.
 */

export type AgendaRange = {
  /** Inclusive ISO bounds. `to` is undefined for the unbounded "tutto" view. */
  from: string;
  to?: string;
  /** Which preset is active, for highlighting. */
  preset: "oggi" | "giorno" | "7" | "tutto";
  /** Day navigation targets. */
  prev: string;
  next: string;
  today: string;
  /** Human label for the header. */
  label: string;
};

const isIso = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Shift an ISO date by whole days (UTC math — DST-safe). */
function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The same shift, for callers that have to bound a range this helper built. */
export const shiftIsoDate = shift;

const pretty = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export function agendaRange(
  params: { giorno?: string; giorni?: string },
  now: Date = new Date(),
): AgendaRange {
  const today = dateInRome(now);
  const nav = (from: string) => ({ prev: shift(from, -1), next: shift(from, 1), today });

  if (params.giorni === "tutto") {
    return { from: today, preset: "tutto", label: "tutte le prenotazioni in arrivo", ...nav(today) };
  }
  if (params.giorni === "7") {
    const to = shift(today, 6);
    return {
      from: today,
      to,
      preset: "7",
      label: `dal ${pretty(today)} al ${pretty(to)}`,
      ...nav(today),
    };
  }

  const day = isIso(params.giorno) ? params.giorno : today;
  return {
    from: day,
    to: day,
    preset: day === today ? "oggi" : "giorno",
    label: pretty(day),
    ...nav(day),
  };
}
