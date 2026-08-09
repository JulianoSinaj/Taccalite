import Link from "next/link";
import { inputCls, labelCls } from "./ui";

/**
 * Shared list-filter chrome.
 *
 * Every admin list had its own `filterHref` closure and `chipCls` helper; this
 * is the one implementation. Give it the page's active filter bag (the object
 * `lib/admin/filters` produced) and it renders links that change one facet while
 * preserving the others — always dropping `page`, since changing a filter
 * invalidates the current page number.
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

const TONES = {
  gold: "bg-gold text-brown-950",
  dark: "bg-brown-950 text-cream",
  deep: "bg-gold-deep text-cream",
} as const;

export function FilterChips({
  basePath,
  params,
  name,
  options,
  tone = "gold",
  className = "mb-3",
}: {
  basePath: string;
  params: Params;
  /** Which query param this row of chips controls. */
  name: string;
  options: ChipOption[];
  tone?: keyof typeof TONES;
  className?: string;
}) {
  if (options.length <= 1) return null;
  const active = params[name] ?? "all";
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o) => (
        <Link
          key={o.value}
          href={filterHref(basePath, params, { [name]: o.value })}
          className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
            active === o.value ? TONES[tone] : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/**
 * GET search box that keeps the other active facets via hidden inputs, plus a
 * "clear" link when a search is in effect.
 */
export function FilterSearch({
  basePath,
  params,
  placeholder,
  label = "Cerca",
}: {
  basePath: string;
  params: Params;
  placeholder?: string;
  label?: string;
}) {
  const q = params.q ?? "";
  const hidden = Object.entries(params).filter(
    ([k, v]) => k !== "q" && k !== "page" && v && v !== "all",
  );
  return (
    <form action={basePath} method="get" className="mb-6 flex flex-wrap items-end gap-3">
      {hidden.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="min-w-[14rem] flex-1">
        <label className={labelCls} htmlFor={`${basePath}-q`}>
          {label}
        </label>
        <input
          id={`${basePath}-q`}
          name="q"
          defaultValue={q}
          placeholder={placeholder ?? "Cerca…"}
          className={inputCls}
        />
      </div>
      <button
        type="submit"
        className="rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
      >
        Cerca
      </button>
      {q && (
        <Link
          href={filterHref(basePath, params, { q: undefined })}
          className="rounded-full bg-brown-900/10 px-5 py-2.5 text-xs font-bold tracking-widest text-brown-800 uppercase hover:bg-brown-900/15"
        >
          Azzera
        </Link>
      )}
    </form>
  );
}

/** Build chip options from a list of distinct values, prefixed with "all". */
export function chipsFrom(values: string[], allLabel: string): ChipOption[] {
  return [{ value: "all", label: allLabel }, ...values.map((v) => ({ value: v, label: v }))];
}
