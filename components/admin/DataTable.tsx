import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { filterHref } from "./FilterBar";
import type { SortSpec } from "@/lib/admin/filters";

/**
 * The tabular admin lists.
 *
 * Every list used to hand-roll its own row markup, which is why sorting and
 * density couldn't be added once. Columns are declared as data here, so a page
 * says what its columns are and the table owns how they behave.
 *
 * Sorting is server-side and URL-driven (`?colonna=&verso=`), so a sorted view is
 * linkable and survives a reload — and the sort key is validated against the
 * page's allow-list before it ever reaches SQL (see `sortFilters`).
 *
 * Not every list belongs here: reservations and the email outbox are genuinely
 * card-shaped (multi-line detail, several inline forms per row) and forcing them
 * into columns would read worse.
 */

export type Density = "comoda" | "compatta";

export type Column<T> = {
  /** Stable key; also the sort key when `sortable`. */
  key: string;
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T) => ReactNode;
  /** Set when the server can order by this column. */
  sortable?: boolean;
  align?: "left" | "right" | "center";
  /** Hidden below `sm`, for columns that don't survive a narrow screen. */
  hideOnMobile?: boolean;
  className?: string;
};

const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;

export const DENSITIES: { value: Density; label: string }[] = [
  { value: "comoda", label: "Comoda" },
  { value: "compatta", label: "Compatta" },
];

export function densityFrom(value: string | undefined): Density {
  return value === "compatta" ? "compatta" : "comoda";
}

/** Density toggle, rendered next to the filters. */
export function DensityToggle({
  basePath,
  params,
  density,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  density: Density;
}) {
  return (
    <div className="flex items-center gap-1 print:hidden">
      {DENSITIES.map((d) => (
        <Link
          key={d.value}
          href={filterHref(basePath, params, { densita: d.value, page: undefined })}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold tracking-widest uppercase ${
            density === d.value
              ? "bg-brown-950 text-cream"
              : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
          }`}
        >
          {d.label}
        </Link>
      ))}
    </div>
  );
}

function SortHeader({
  basePath,
  params,
  column,
  sort,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  column: Column<unknown>;
  sort: SortSpec;
}) {
  const active = sort.colonna === column.key;
  // Clicking the active column flips direction; a new column starts descending,
  // which is what you want for dates and money (the common case).
  const next = active && sort.verso === "desc" ? "asc" : "desc";
  const Icon = !active ? ChevronsUpDown : sort.verso === "asc" ? ChevronUp : ChevronDown;

  return (
    <Link
      href={filterHref(basePath, params, { colonna: column.key, verso: next, page: undefined })}
      className={`inline-flex items-center gap-1 hover:text-brown-950 ${active ? "text-brown-950" : ""}`}
      aria-label={`Ordina per ${typeof column.header === "string" ? column.header : column.key}`}
    >
      {column.header}
      <Icon className={`size-3 ${active ? "opacity-100" : "opacity-40"}`} />
    </Link>
  );
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  basePath,
  params,
  sort,
  density = "comoda",
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  basePath: string;
  /** Active filters, so a sort link preserves them. */
  params: Record<string, string | undefined>;
  sort: SortSpec;
  density?: Density;
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-brown-900/10 bg-surface p-6 shadow-sm">
        <p className="text-brown-800/70">{empty ?? "Nessun risultato."}</p>
      </div>
    );
  }

  const pad = density === "compatta" ? "px-4 py-2" : "px-5 py-3.5";

  return (
    <div className="overflow-x-auto rounded-2xl border border-brown-900/10 bg-surface shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brown-900/10 text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`${pad} ${alignCls[c.align ?? "left"]} ${c.hideOnMobile ? "hidden sm:table-cell" : ""}`}
              >
                {c.sortable ? (
                  <SortHeader
                    basePath={basePath}
                    params={params}
                    column={c as Column<unknown>}
                    sort={sort}
                  />
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brown-900/5">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="align-middle hover:bg-brown-900/[0.02]">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`${pad} ${alignCls[c.align ?? "left"]} ${
                    c.hideOnMobile ? "hidden sm:table-cell" : ""
                  } ${c.className ?? ""}`}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
