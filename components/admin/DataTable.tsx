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
  /**
   * Pin this column to the left edge while the table is scrolled sideways.
   *
   * Set it on the column that says *which record a row is* — the order number,
   * the product name. On a phone the table is roughly twice the width of the
   * screen, and without an anchor the moment you scroll to the status column you
   * no longer know whose status it is.
   *
   * A per-column flag rather than "the first column", because the first column
   * is often the bulk-select checkbox and that identifies nothing.
   */
  sticky?: boolean;
  className?: string;
};

const alignCls = { left: "text-left", right: "text-right", center: "text-center" } as const;

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
      className={`tap inline-flex items-center gap-1 hover:text-brown-950 ${active ? "text-brown-950" : ""}`}
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
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  basePath: string;
  /** Active filters, so a sort link preserves them. */
  params: Record<string, string | undefined>;
  sort: SortSpec;
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-brown-900/10 bg-surface p-6 shadow-sm">
        <p className="text-brown-800/70">{empty ?? "Nessun risultato."}</p>
      </div>
    );
  }

  const pad = "px-5 py-3.5";
  const hidden = (c: Column<T>) => (c.hideOnMobile ? "hidden sm:table-cell" : "");
  // An opaque ground is what makes a pinned cell pin: without it the columns it
  // is meant to sit in front of scroll straight through it.
  const pinned = (c: Column<T>) =>
    c.sticky ? "sticky left-0 z-10 bg-surface border-r border-brown-900/10" : "";

  return (
    // `scroll-x` (globals.css) is the affordance: a shadow at whichever edge has
    // content beyond it, which disappears when you reach that end. Without it a
    // table cut off at the panel edge looks exactly like a table that ends there.
    <div className="scroll-x rounded-2xl border border-brown-900/10 bg-surface shadow-sm">
      {/*
       * `border-separate` rather than the default `collapse`: a `position:
       * sticky` cell is unreliable inside a collapsed table (Safari drops it
       * outright), because the border model reassigns the cell's box. The row
       * rules therefore live on the cells, which is why the last row skips its
       * own — a hairline sitting on the panel's bottom edge.
       */}
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`${pad} border-b border-brown-900/10 bg-surface ${alignCls[c.align ?? "left"]} ${hidden(c)} ${
                  c.sticky ? "sticky left-0 z-20 border-r border-brown-900/10" : ""
                }`}
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
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row)} className="group align-middle">
              {columns.map((c) => (
                <td
                  key={c.key}
                  // The hover tint is on the cells, not the row: a pinned cell
                  // paints its own opaque ground, so a `<tr>` background would
                  // stop at its edge and the highlight would break mid-row.
                  className={`${pad} ${alignCls[c.align ?? "left"]} ${hidden(c)} ${pinned(c)} ${
                    i < rows.length - 1 ? "border-b border-brown-900/5" : ""
                  } group-hover:bg-surface-sunken ${c.className ?? ""}`}
                >
                  {/* A pinned column sizes to its content, and inside a
                      horizontal scroller there is always room — so one long
                      email address could leave a phone with a 300px anchor and
                      70px of table. The cap only applies where the pinning
                      does. */}
                  {c.sticky ? (
                    <div className="max-w-[13rem] sm:max-w-none">{c.cell(row)}</div>
                  ) : (
                    c.cell(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
