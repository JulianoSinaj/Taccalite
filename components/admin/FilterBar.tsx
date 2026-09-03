import Link from "next/link";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
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

/**
 * Merge one facet change into the active filters and render the URL.
 *
 * `pageParam` names the pager this facet invalidates. Two lists on one page
 * paginate independently (`page` / `rpage`), and a filter on the second must
 * reset its own pager — not send the first list back to page one.
 */
export function filterHref(basePath: string, params: Params, patch: Params, pageParam = "page"): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (k === pageParam) continue; // a filter change resets paging
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
  pageParam = "page",
}: {
  basePath: string;
  params: Params;
  name: string;
  options: ChipOption[];
  /** Screen-reader name for the control ("Filtra per stato"). */
  label: string;
  /** The pager this control resets — see `filterHref`. */
  pageParam?: string;
}) {
  if (options.length <= 1) return null;
  const active = params[name] ?? "all";
  return (
    // Scrolls rather than wraps on a narrow screen, so the control stays one
    // visual unit instead of breaking into ragged rows.
    //
    // `.scroll-x` for the same reason the tables have it, and it was the one
    // sideways scroller in the gestionale without it: on a 390px phone the seven
    // order-status chips measure 793px in a 356px window, so four of them —
    // "Incassati", "Evasi", "Annullati", "Rimborsati" — sat off-screen behind a
    // deliberately hidden scrollbar, with nothing at the edge to say the row
    // continued. `--scroll-ground` is overridden because this strip sits on the
    // page rather than on a panel; both tokens invert with the dark theme, so
    // one value covers both.
    //
    // The margins are rebalanced rather than changed: `-m-1 p-1` gives the
    // gutter the shadow needs on every side while `mb-3 + p-1` keeps the same
    // 16px below the control that `mb-4 + pb-1` gave before.
    <div className="scroll-x no-scrollbar -m-1 mb-3 p-1 [--scroll-ground:var(--color-cream)]">
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
              href={filterHref(basePath, params, { [name]: o.value }, pageParam)}
              aria-current={on ? "page" : undefined}
              className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest whitespace-nowrap uppercase transition-colors ${
                on
                  ? "bg-gold text-on-gold shadow-sm"
                  : "text-brown-800/80 hover:bg-surface/60 hover:text-brown-950"
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
  // How many of the collapsed facets are currently narrowing the list, so the
  // phone's disclosure can say so without being opened.
  const activeFacets = facets.filter((f) => isActive(params[f.name])).length;
  const moreId = `${formId}-more`;

  return (
    <form
      id={formId}
      action={basePath}
      method="get"
      className="mb-3 grid grid-cols-1 gap-3 rounded-2xl border border-brown-900/10 bg-surface p-4 shadow-sm sm:flex sm:flex-wrap sm:items-end"
    >
      <FilterAutoSubmit formId={formId} />
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <div className="sm:min-w-[13rem] sm:flex-1">
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

      {/*
       * Below `sm` the facets fold away behind this.
       *
       * The toolbar is one line on a laptop and a stack of seven controls on a
       * phone: measured at 703px on a 390px screen, which — with the header, the
       * status chips and the bulk bar — put the first order of the list 1718px
       * down, two full screens of chrome before any data. Search stays out (it
       * is what the counter reaches for most) and so does the submit button; the
       * four selects and the date range go behind a disclosure.
       *
       * A checkbox and `display: contents` rather than state, because this is a
       * server component and both alternatives are worse: `<details>` cannot be
       * forced open by a media query in every browser, and a client component
       * would either flash the whole panel open on load or leave an operator
       * with no JS unable to reach the facets at all — the toolbar is a plain
       * GET form precisely so that it works without us.
       *
       * `contents` and not `block`: these divs are grid items of the form, and a
       * real wrapper box would collapse the six controls into one cell.
       */}
      <input type="checkbox" id={moreId} className="peer sr-only" />
      <label
        htmlFor={moreId}
        // The chevron turns over through the peer rather than through state, and
        // the focus ring is here rather than on the box because the box is
        // `sr-only` — reachable by keyboard, and otherwise invisible when it is.
        className="inline-flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-brown-900/15 bg-cream/40 px-3 text-xs font-bold tracking-widest text-brown-800/80 uppercase select-none peer-focus-visible:ring-2 peer-focus-visible:ring-gold-deep peer-checked:[&_svg:last-child]:rotate-180 sm:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="size-4" aria-hidden />
          Altri filtri
          {activeFacets > 0 && (
            <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] text-on-gold tabular-nums">
              {activeFacets}
            </span>
          )}
        </span>
        <ChevronDown className="size-4 transition-transform" aria-hidden />
      </label>

      <div className="hidden peer-checked:contents sm:contents">
        {facets.map((f) => (
          <div key={f.name} className="sm:min-w-[10rem]">
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

        {/* The date range and anything else a page adds folds away with the
            facets — it is the tallest part of the panel on the orders list. */}
        {children}
      </div>

      {/* Full width below `sm`. Wrapped onto its own line by `flex-wrap` it
          otherwise sat as a short pill against the left edge under a stack of
          full-width selects, reading as an orphan rather than as the action. */}
      <button
        type="submit"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900 sm:w-auto"
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
      <span className="font-bold tracking-widest text-brown-800/70 uppercase">Filtri attivi</span>
      {active.map(([k, v]) => {
        const { title, format } = labels[k];
        return (
          <Link
            key={k}
            href={filterHref(basePath, params, { [k]: undefined })}
            // `.tap` for the same reason "Azzera tutto" beside it has one: these
            // are ~26px tall, and they sit shoulder to shoulder in a row where
            // the wrong one removes the wrong facet. The pseudo-element widens
            // the target without drawing the pill any bigger.
            className="tap group inline-flex items-center gap-1.5 rounded-full bg-brown-900/8 py-1.5 pr-2 pl-3 text-brown-900 hover:bg-brown-900/15"
            aria-label={`Rimuovi filtro ${title}: ${format ? format(v) : v}`}
          >
            <span className="text-brown-800/70">{title}:</span>
            <span className="font-semibold">{format ? format(v) : v}</span>
            <span aria-hidden className="text-base leading-none text-brown-800/70 group-hover:text-brown-950">
              ×
            </span>
          </Link>
        );
      })}
      {/* Deliberately not another `bg-brown-900/8` pill: sitting at the end of a
          row of them, a fourth filled pill reads as a fifth facet rather than as
          the thing that undoes them. A dashed hairline says "not a filter", and
          filling in on hover gives it the affordance the bare text link never
          had. `.tap` rather than `min-h-11` so the 44px target arrives without
          the control being drawn taller than the pills it sits beside. */}
      <Link
        href={basePath}
        aria-label="Azzera tutti i filtri"
        className="tap group/reset ml-1 inline-flex items-center gap-1.5 rounded-full border border-dashed border-brown-900/25 px-3 py-1.5 font-bold tracking-widest text-brown-800/70 uppercase transition-[color,background-color,border-color,transform] duration-200 hover:border-solid hover:border-brown-950 hover:bg-brown-950 hover:text-cream focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none active:scale-[0.97]"
      >
        <span
          aria-hidden
          className="text-sm leading-none transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/reset:-rotate-180"
        >
          ↺
        </span>
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
