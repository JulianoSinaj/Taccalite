import Link from "next/link";
import { inputCls, labelCls } from "./ui";
import FilterAutoSubmit from "./FilterAutoSubmit";

/**
 * Shared list-filter chrome.
 *
 * Every admin list had its own `filterHref` closure and `chipCls` helper; this
 * is the one implementation. Give it the page's active filter bag (the object
 * `lib/admin/filters` produced) and it renders controls that change one facet
 * while preserving the others — always dropping `page`, since changing a filter
 * invalidates the current page number.
 *
 * ## Why this shape
 *
 * These lists used to stack one row of identical pills per facet: three rows and
 * fourteen buttons above the orders list, none of them labelled. That fails in
 * four ways at once — you can't tell what a row filters (three of the pills read
 * "Tutti"), every row carries the same visual weight so nothing signals which
 * choice matters, it costs ~150px before the first row of data, and each new
 * facet adds another row.
 *
 * The replacement separates the two things those rows conflated:
 *
 *  - `SegmentedFilter` — the ONE facet an operator flips constantly (the work
 *    queue: to-fulfil / paid / all). A single connected control, so it reads as
 *    "which view am I in", not as loose buttons.
 *  - `FilterToolbar` — every other facet, as labelled selects on one line
 *    alongside search. Self-describing, constant height, and adding a facet
 *    costs a dropdown rather than a row.
 *  - `ActiveFilters` — a summary line, rendered only when something is on, where
 *    each active facet can be removed individually.
 */

export type ChipOption = { value: string; label: string };

type Params = Record<string, string | undefined>;

/** Merge one facet change into the active filters and render the URL. */
export function filterHref(basePath: string, params: Params, patch: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (k === "page") continue; // a filter change resets paging
    if (v && v !== "all") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** True for a facet that is actually narrowing the list. */
const isActive = (v: string | undefined): v is string => !!v && v !== "all";

// ── Primary facet ────────────────────────────────────────────────────────────

/**
 * The page's main view switch, as one segmented control.
 *
 * Reserve it for the facet an operator changes most (order status, reservation
 * status). Everything else belongs in the toolbar: two segmented controls on one
 * page would recreate the "which row is which" problem this replaced.
 */
export function SegmentedFilter({
  basePath,
  params,
  name,
  options,
  label,
}: {
  basePath: string;
  params: Params;
  name: string;
  options: ChipOption[];
  /** Screen-reader name for the control ("Filtra per stato"). */
  label: string;
}) {
  if (options.length <= 1) return null;
  const active = params[name] ?? "all";
  return (
    // Scrolls rather than wraps on a narrow screen, so the control stays one
    // visual unit instead of breaking into ragged rows.
    <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
      <div
        role="group"
        aria-label={label}
        className="inline-flex gap-1 rounded-full bg-brown-900/8 p-1"
      >
        {options.map((o) => {
          const on = active === o.value;
          return (
            <Link
              key={o.value}
              href={filterHref(basePath, params, { [name]: o.value })}
              aria-current={on ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest whitespace-nowrap uppercase transition-colors ${
                on
                  ? "bg-gold text-brown-950 shadow-sm"
                  : "text-brown-800/80 hover:bg-white/60 hover:text-brown-950"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Secondary facets + search ────────────────────────────────────────────────

export type FacetSelect = {
  /** Query-string parameter this select controls. */
  name: string;
  label: string;
  options: ChipOption[];
};

/**
 * Search box plus one labelled select per secondary facet, on a single line.
 *
 * Rendered as a native GET form so it works with JS disabled; `FilterAutoSubmit`
 * upgrades it to apply on change. Facets not represented by a control here are
 * carried through as hidden inputs, so submitting never silently drops the
 * segmented control's state or a date range.
 */
export function FilterToolbar({
  basePath,
  params,
  facets = [],
  searchPlaceholder,
  searchLabel = "Cerca",
  /** Facets rendered by something other than this toolbar (e.g. the segmented
   *  control, a date range) — preserved but not shown as inputs. */
  carry = [],
  formId = "filters",
  children,
}: {
  basePath: string;
  params: Params;
  facets?: FacetSelect[];
  searchPlaceholder?: string;
  searchLabel?: string;
  carry?: string[];
  formId?: string;
  /** Extra controls (a date range, say) rendered inside the same form. */
  children?: React.ReactNode;
}) {
  const shown = new Set([...facets.map((f) => f.name), "q", "page"]);
  const hidden = Object.entries(params).filter(
    ([k, v]) => !shown.has(k) && (carry.length === 0 || carry.includes(k)) && isActive(v),
  );

  return (
    <form
      id={formId}
      action={basePath}
      method="get"
      className="mb-3 flex flex-wrap items-end gap-3 rounded-2xl border border-brown-900/10 bg-white p-4 shadow-sm"
    >
      <FilterAutoSubmit formId={formId} />
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <div className="min-w-[13rem] flex-1">
        <label className={labelCls} htmlFor={`${formId}-q`}>
          {searchLabel}
        </label>
        <input
          id={`${formId}-q`}
          name="q"
          defaultValue={params.q ?? ""}
          placeholder={searchPlaceholder ?? "Cerca…"}
          className={inputCls}
        />
      </div>

      {facets.map((f) => (
        <div key={f.name} className="min-w-[10rem]">
          <label className={labelCls} htmlFor={`${formId}-${f.name}`}>
            {f.label}
          </label>
          <select
            id={`${formId}-${f.name}`}
            name={f.name}
            defaultValue={params[f.name] ?? "all"}
            className={inputCls}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {children}

      <button
        type="submit"
        className="rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
      >
        Filtra
      </button>
    </form>
  );
}

// ── Active-filter summary ────────────────────────────────────────────────────

/**
 * What the list is currently narrowed by, with a per-facet remove and a single
 * "clear everything".
 *
 * The old pills answered "what can I filter by"; nothing answered "what am I
 * filtering by right now" — which is the question behind an operator staring at
 * an unexpectedly empty list. Renders nothing when no filter is on.
 */
export function ActiveFilters({
  basePath,
  params,
  labels,
}: {
  basePath: string;
  params: Params;
  /** Per-facet display: a title, and how to render the raw value. */
  labels: Record<string, { title: string; format?: (value: string) => string }>;
}) {
  const active: [string, string][] = [];
  for (const [k, v] of Object.entries(params)) {
    if (k !== "page" && isActive(v) && labels[k]) active.push([k, v]);
  }
  if (active.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold tracking-widest text-brown-800/60 uppercase">Filtri attivi</span>
      {active.map(([k, v]) => {
        const { title, format } = labels[k];
        return (
          <Link
            key={k}
            href={filterHref(basePath, params, { [k]: undefined })}
            className="group inline-flex items-center gap-1.5 rounded-full bg-brown-900/8 py-1.5 pr-2 pl-3 text-brown-900 hover:bg-brown-900/15"
            aria-label={`Rimuovi filtro ${title}: ${format ? format(v) : v}`}
          >
            <span className="text-brown-800/60">{title}:</span>
            <span className="font-semibold">{format ? format(v) : v}</span>
            <span aria-hidden className="text-base leading-none text-brown-800/50 group-hover:text-brown-950">
              ×
            </span>
          </Link>
        );
      })}
      <Link
        href={basePath}
        className="rounded-full px-3 py-1.5 font-bold tracking-widest text-brown-800/70 uppercase underline-offset-2 hover:text-brown-950 hover:underline"
      >
        Azzera tutto
      </Link>
    </div>
  );
}

/** Build options from a list of distinct values, prefixed with a catch-all. */
export function chipsFrom(values: string[], allLabel: string): ChipOption[] {
  return [{ value: "all", label: allLabel }, ...values.map((v) => ({ value: v, label: v }))];
}

/** Look up a display label for a raw facet value, for `ActiveFilters`. */
export function labelFrom(options: ChipOption[]): (value: string) => string {
  const map = new Map(options.map((o) => [o.value, o.label]));
  return (value: string) => map.get(value) ?? value;
}
