import "server-only";
import { dateInRome } from "@/lib/time";

/**
 * Fiscal period resolution for the IVA report and its CSV export.
 *
 * Lives outside the page for two reasons: the report and the export must agree
 * on exactly the same bounds, and the React Compiler lint forbids calling
 * `new Date()` in a component's render body.
 *
 * Bounds are **[from, toExclusive)**. The previous `T23:59:59` upper bound
 * silently dropped anything settled in the final second of a period; taking the
 * start of the next day instead cannot.
 */

export type VatPresetKey = "mese" | "mese-scorso" | "trimestre" | "trimestre-scorso" | "anno";

export const VAT_PRESETS: { key: VatPresetKey; label: string }[] = [
  { key: "mese", label: "Questo mese" },
  { key: "mese-scorso", label: "Mese scorso" },
  { key: "trimestre", label: "Questo trimestre" },
  { key: "trimestre-scorso", label: "Trimestre scorso" },
  { key: "anno", label: "Anno in corso" },
];

const isIsoDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** `yyyy-mm-dd` for a y/m/d triple (month is 1-based). */
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Add `n` months to a (year, month) pair, 1-based month. */
function addMonths(y: number, m: number, n: number): [number, number] {
  const zero = y * 12 + (m - 1) + n;
  return [Math.floor(zero / 12), (zero % 12) + 1];
}

export type ResolvedVatPeriod = {
  from: Date;
  /** Exclusive upper bound — the instant the day AFTER `toISO` begins. */
  toExclusive: Date;
  /** Inclusive ISO bounds, for form defaults and export links. */
  fromISO: string;
  toISO: string;
  preset: VatPresetKey | null;
};

/** The ISO bounds (inclusive) of a named preset, in the business timezone. */
function presetRange(key: VatPresetKey, today: string): { fromISO: string; toISO: string } {
  const [y, m] = today.split("-").map(Number);

  if (key === "mese") {
    const [ny, nm] = addMonths(y, m, 1);
    return { fromISO: iso(y, m, 1), toISO: dayBefore(iso(ny, nm, 1)) };
  }
  if (key === "mese-scorso") {
    const [py, pm] = addMonths(y, m, -1);
    return { fromISO: iso(py, pm, 1), toISO: dayBefore(iso(y, m, 1)) };
  }
  if (key === "trimestre" || key === "trimestre-scorso") {
    const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const shift = key === "trimestre" ? 0 : -3;
    const [sy, sm] = addMonths(y, startMonth, shift);
    const [ey, em] = addMonths(sy, sm, 3);
    return { fromISO: iso(sy, sm, 1), toISO: dayBefore(iso(ey, em, 1)) };
  }
  // anno
  return { fromISO: iso(y, 1, 1), toISO: dayBefore(iso(y + 1, 1, 1)) };
}

/** The ISO date one day before the given ISO date (UTC math — DST-safe). */
function dayBefore(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** The instant a local ISO date begins, in the server's interpretation. */
const startOf = (isoDate: string) => new Date(`${isoDate}T00:00:00`);

/** The instant the day AFTER a local ISO date begins. */
function endExclusive(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return startOf(next);
}

/**
 * Resolve the requested period. An explicit `da`/`a` pair wins; otherwise the
 * named preset; otherwise the current month.
 */
export function vatPeriod(
  params: { da?: string; a?: string; periodo?: string },
  now: Date = new Date(),
): ResolvedVatPeriod {
  const today = dateInRome(now);
  const explicit = isIsoDate(params.da) || isIsoDate(params.a);

  let fromISO: string;
  let toISO: string;
  let preset: VatPresetKey | null = null;

  if (explicit) {
    const month = presetRange("mese", today);
    fromISO = isIsoDate(params.da) ? params.da : month.fromISO;
    toISO = isIsoDate(params.a) ? params.a : today;
  } else {
    preset = (VAT_PRESETS.find((p) => p.key === params.periodo)?.key ?? "mese") as VatPresetKey;
    ({ fromISO, toISO } = presetRange(preset, today));
  }

  // A backwards range would silently report nothing; normalise instead.
  if (toISO < fromISO) [fromISO, toISO] = [toISO, fromISO];

  return { from: startOf(fromISO), toExclusive: endExclusive(toISO), fromISO, toISO, preset };
}
