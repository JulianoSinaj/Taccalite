"use client";

import { useId, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { inputCls, labelCls } from "./ui";
import { weekdayName, structuredToRows, type DayHours } from "@/lib/hours";
import type { ShopRow } from "@/lib/db/schema";

/**
 * Weekly opening-hours editor.
 *
 * Hours used to be free prose (`"Lun–Ven | 9:00–13:00, 16:00–20:00"`) parsed
 * best-effort at render time. That parser fails *safe* — it shows nothing rather
 * than guess — so a typo silently removed the "aperto adesso" badge from the
 * public site with no signal anywhere. Here the operator sets times per day and
 * the displayed prose is derived from the data, so the two can't drift.
 *
 * The structured value is posted as JSON in a hidden field; the derived rows go
 * in the legacy `hours` field so nothing downstream has to change at once.
 */

type Range = { open: string; close: string };
type DayState = { day: number; closed: boolean; ranges: Range[] };

const DEFAULT_RANGE: Range = { open: "09:00", close: "13:00" };

/** Seed the editor from a shop: structured hours if present, else a sane week. */
function initialDays(shop?: ShopRow | null): DayState[] {
  const stored = shop?.hoursStructured;
  return Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const entry = stored?.find((d) => d.day === day);
    if (!entry) {
      // No structured data yet: start every day closed rather than inventing
      // opening times the shop never stated.
      return { day, closed: true, ranges: [] };
    }
    return {
      day,
      closed: entry.ranges.length === 0,
      ranges: entry.ranges.length > 0 ? entry.ranges.map((r) => ({ ...r })) : [{ ...DEFAULT_RANGE }],
    };
  });
}

export function HoursEditor({ shop }: { shop?: ShopRow | null }) {
  // Local rather than `useFieldIds` from ./forms: that module imports this one,
  // and the round trip would be a cycle.
  const uid = useId();
  const [days, setDays] = useState<DayState[]>(() => initialDays(shop));
  // A *new* shop starts structured. The flag used to be derived from stored
  // structured hours alone, so `/admin/shops/new` — which has none — opened on
  // the legacy free-text box, under its own help text telling the operator to
  // turn structured hours on. Only a shop that already has prose and has never
  // been migrated still lands in the old mode.
  const [useStructured, setUseStructured] = useState(
    () => !shop || (!!shop.hoursStructured && shop.hoursStructured.length > 0),
  );

  const update = (day: number, fn: (d: DayState) => DayState) =>
    setDays((ds) => ds.map((d) => (d.day === day ? fn(d) : d)));

  /** The payload the server validates, and the prose derived from it. */
  const { json, preview } = useMemo(() => {
    const structured: DayHours[] = days.map((d) => ({
      day: d.day,
      ranges: d.closed
        ? []
        : d.ranges.filter((r) => r.open && r.close && r.close > r.open).map((r) => ({ ...r })),
    }));
    return {
      json: JSON.stringify(structured),
      preview: structuredToRows(structured),
    };
  }, [days]);

  // Copy Monday's schedule to the rest of the working week — the common case.
  const copyMondayToWeekdays = () => {
    const monday = days.find((d) => d.day === 1);
    if (!monday) return;
    setDays((ds) =>
      ds.map((d) =>
        d.day >= 2 && d.day <= 5
          ? { ...d, closed: monday.closed, ranges: monday.ranges.map((r) => ({ ...r })) }
          : d,
      ),
    );
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        {/* Bound to whichever control is showing: the free-text box below has
            an id, the structured grid names its own time fields, so there the
            label is a group heading rather than a field label. */}
        <label className={`${labelCls} mb-0`} htmlFor={useStructured ? undefined : `${uid}-hours`}>
          Orari di apertura
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-brown-900">
          <input
            type="checkbox"
            checked={useStructured}
            onChange={(e) => setUseStructured(e.target.checked)}
            className="h-4 w-4 rounded accent-brown-950"
          />
          Usa gli orari strutturati
        </label>
      </div>

      {useStructured ? (
        <>
          {/* The value the server stores and the prose it renders, both derived
              from the grid below so they can never disagree. */}
          <input type="hidden" name="hoursStructured" value={json} />
          <input type="hidden" name="hours" value={preview.map((r) => `${r.label} | ${r.value}`).join("\n")} />

          <div className="space-y-2 rounded-xl border border-brown-900/10 bg-cream/40 p-3">
            {days.map((d) => (
              <div key={d.day} className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-sm font-semibold text-brown-950">
                  {weekdayName(d.day)}
                </span>
                <label className="flex items-center gap-1.5 text-xs text-brown-800">
                  <input
                    type="checkbox"
                    checked={d.closed}
                    onChange={(e) =>
                      update(d.day, (x) => ({
                        ...x,
                        closed: e.target.checked,
                        ranges: e.target.checked || x.ranges.length > 0 ? x.ranges : [{ ...DEFAULT_RANGE }],
                      }))
                    }
                    className="h-4 w-4 rounded accent-brown-950"
                  />
                  Chiuso
                </label>

                {!d.closed && (
                  <div className="flex flex-wrap items-center gap-2">
                    {d.ranges.map((r, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <input
                          type="time"
                          value={r.open}
                          aria-label={`${weekdayName(d.day)} — apertura ${i + 1}`}
                          onChange={(e) =>
                            update(d.day, (x) => ({
                              ...x,
                              ranges: x.ranges.map((y, j) => (j === i ? { ...y, open: e.target.value } : y)),
                            }))
                          }
                          className={`${inputCls} w-28 py-1.5`}
                        />
                        <span className="text-brown-800/70">–</span>
                        <input
                          type="time"
                          value={r.close}
                          aria-label={`${weekdayName(d.day)} — chiusura ${i + 1}`}
                          onChange={(e) =>
                            update(d.day, (x) => ({
                              ...x,
                              ranges: x.ranges.map((y, j) => (j === i ? { ...y, close: e.target.value } : y)),
                            }))
                          }
                          className={`${inputCls} w-28 py-1.5`}
                        />
                        {d.ranges.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Rimuovi fascia ${i + 1} di ${weekdayName(d.day)}`}
                            onClick={() =>
                              update(d.day, (x) => ({ ...x, ranges: x.ranges.filter((_, j) => j !== i) }))
                            }
                            className="rounded-full p-1 text-brown-800/70 hover:bg-danger-soft hover:text-danger"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        update(d.day, (x) => ({ ...x, ranges: [...x.ranges, { open: "16:00", close: "20:00" }] }))
                      }
                      className="inline-flex items-center gap-1 rounded-full bg-brown-900/10 px-2.5 py-1 text-[12px] font-bold tracking-wide text-brown-950 uppercase hover:bg-brown-900/15"
                    >
                      <Plus className="size-3" /> Fascia
                    </button>
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={copyMondayToWeekdays}
              className="mt-1 rounded-full bg-brown-900/10 px-3 py-1.5 text-[12px] font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Copia lunedì su mar–ven
            </button>
          </div>

          <div className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs text-brown-800/70">
            <span className="font-bold tracking-widest uppercase">Sul sito</span>
            <ul className="mt-1 space-y-0.5">
              {preview.length === 0 ? (
                <li className="text-brown-800/70">Nessun orario impostato.</li>
              ) : (
                preview.map((r) => (
                  <li key={r.label}>
                    <span className="font-semibold text-brown-950">{r.label}</span> · {r.value}
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : (
        <>
          {/* Legacy free text, kept for shops not yet migrated. Clearing the
              structured field is what tells the server to fall back to it. */}
          <input type="hidden" name="hoursStructured" value="" />
          <textarea
            id={`${uid}-hours`}
            name="hours"
            rows={3}
            defaultValue={shop?.hours.map((h) => `${h.label} | ${h.value}`).join("\n")}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-brown-800/70">
            Una riga per fascia: <code>Etichetta | Valore</code>. Gli orari liberi vengono interpretati
            alla meglio e, se non sono comprensibili, il badge «aperto adesso» sparisce senza avvisi:
            attiva gli orari strutturati per evitarlo.
          </p>
        </>
      )}
    </div>
  );
}
