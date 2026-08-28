import Link from "next/link";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { Panel, inputCls, labelCls } from "@/components/admin/ui";
import { addHolidayClosures } from "@/lib/admin/fulfilment-actions";
import { fmtDay } from "@/lib/closures";
import { italianHolidays } from "@/lib/holidays";
import type { ShopRow } from "@/lib/db/schema";

/**
 * A year's national holidays as a checklist.
 *
 * Twelve dates typed one at a time every December is how holidays go missing
 * from the calendar until somebody books Pasquetta. A checklist rather than a
 * one-click import because a food shop is very often open on the 8th of
 * December, and the operator is the one who knows.
 */
export function ClosureHolidays({
  year,
  today,
  shops,
  covered,
  defaultShop,
  yearHref,
}: {
  year: number;
  today: string;
  shops: ShopRow[];
  /** Holiday dates already inside a whole-day closure, any scope. */
  covered: Set<string>;
  /** Pre-selected sede, when the page is narrowed to one. */
  defaultShop?: string;
  /** Where the year switch goes — the page owns its query string. */
  yearHref: (year: number) => string;
}) {
  const holidays = italianHolidays(year);
  const open = holidays.filter((h) => h.date >= today && !covered.has(h.date));
  const thisYear = Number(today.slice(0, 4));

  return (
    <Panel className="mb-6">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-lg text-brown-950">Festività nazionali {year}</span>
          <span className="text-xs text-brown-800/70">
            {open.length === 0
              ? "Tutte già coperte o passate"
              : `${open.length} ${open.length === 1 ? "giorno" : "giorni"} non ancora in calendario`}
          </span>
        </summary>

        <div className="mt-2 flex gap-3 text-xs">
          {[thisYear, thisYear + 1].map((y) => (
            <Link
              key={y}
              href={yearHref(y)}
              className={`font-bold tracking-widest uppercase ${
                y === year ? "text-brown-950 underline" : "text-brown-800/70 hover:text-brown-950"
              }`}
            >
              {y}
            </Link>
          ))}
        </div>

        <ActionForm action={addHolidayClosures} className="mt-4 space-y-4">
          <input type="hidden" name="year" value={year} />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {holidays.map((h) => {
              const past = h.date < today;
              const done = covered.has(h.date);
              const id = `hol-${h.date}`;
              return (
                <li key={h.date}>
                  <label
                    htmlFor={id}
                    className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      past || done
                        ? "border-brown-900/10 text-brown-800/70"
                        : "border-brown-900/20 text-brown-950"
                    }`}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      name="dates"
                      value={h.date}
                      // A disabled box is not posted, so a covered or past day
                      // can never be sent even by a stray click.
                      disabled={past || done}
                      defaultChecked={!past && !done}
                      className="h-5 w-5 rounded accent-brown-950"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{h.name}</span>
                      <span className="block text-xs">
                        {fmtDay(h.date, { weekday: true })}
                        {done ? " · già in calendario" : past ? " · passata" : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="hol-shop">
                Sede
              </label>
              <select id="hol-shop" name="shopSlug" defaultValue={defaultShop ?? ""} className={inputCls}>
                <option value="">Tutte le sedi</option>
                {shops.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className={labelCls}>Cosa si ferma</legend>
              <div className="flex flex-wrap gap-5 pt-2">
                <label className="inline-flex items-center gap-2 text-sm text-brown-900">
                  <input
                    type="checkbox"
                    name="blocksReservations"
                    value="true"
                    defaultChecked
                    className="h-5 w-5 rounded accent-brown-950"
                  />
                  Prenotazioni
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-brown-900">
                  <input
                    type="checkbox"
                    name="blocksPickup"
                    value="true"
                    defaultChecked
                    className="h-5 w-5 rounded accent-brown-950"
                  />
                  Ritiri e consegne
                </label>
              </div>
            </fieldset>
          </div>

          <PendingButton disabled={open.length === 0}>Aggiungi le festività selezionate</PendingButton>
        </ActionForm>
      </details>
    </Panel>
  );
}
