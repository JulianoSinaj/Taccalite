import type { ReactNode } from "react";

export function AdminHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-brown-950 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-brown-800/70">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-brown-900/10 bg-white p-6 shadow-sm ${className}`}>{children}</div>
  );
}

const badgeStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-brown-900/10 text-brown-800",
  cancelled: "bg-red-100 text-red-700",
  paid: "bg-emerald-100 text-emerald-800",
  fulfilled: "bg-emerald-100 text-emerald-800",
  refunded: "bg-red-100 text-red-700",
  unpaid: "bg-amber-100 text-amber-800",
  queued: "bg-amber-100 text-amber-800",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
  confirmedSub: "bg-emerald-100 text-emerald-800",
  unsubscribed: "bg-red-100 text-red-700",
};

/** Italian labels for the raw enum values stored in the DB. */
const statusLabels: Record<string, string> = {
  pending: "In attesa",
  confirmed: "Confermata",
  completed: "Completata",
  cancelled: "Annullata",
  paid: "Pagato",
  fulfilled: "Evaso",
  refunded: "Rimborsato",
  unpaid: "Da pagare",
  queued: "In coda",
  sent: "Inviata",
  failed: "Fallita",
  unsubscribed: "Disiscritto",
};

export function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase ${
        badgeStyles[status] ?? "bg-brown-900/10 text-brown-800"
      }`}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}

export const inputCls =
  "w-full rounded-lg border border-brown-900/15 bg-cream/40 px-3 py-2.5 text-sm text-brown-950 focus:border-gold-dark focus:outline-none";

export const labelCls = "mb-1.5 block text-[11px] font-bold tracking-widest text-brown-800/70 uppercase";

export function SubmitButton({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "dark" | "danger" }) {
  const tones = {
    gold: "bg-gold text-brown-950 hover:bg-gold-dark",
    dark: "bg-brown-950 text-cream hover:bg-brown-900",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type="submit"
      className={`rounded-full px-5 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

/** GET search box that submits to the current page (preserves other params via hidden inputs). */
export function SearchBox({
  basePath,
  q,
  placeholder,
  hidden = {},
}: {
  basePath: string;
  q?: string;
  placeholder?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form action={basePath} method="get" className="mb-4 flex gap-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder ?? "Cerca…"}
        className={`${inputCls} max-w-xs`}
      />
      <button
        type="submit"
        className="rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
      >
        Cerca
      </button>
    </form>
  );
}

/** Prev/next pagination that preserves the current query string. */
export function Pagination({
  basePath,
  page,
  pageCount,
  params = {},
}: {
  basePath: string;
  page: number;
  pageCount: number;
  params?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const btn = "rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase";
  return (
    <div className="mt-6 flex items-center justify-between">
      <a
        href={page > 1 ? href(page - 1) : undefined}
        aria-disabled={page <= 1}
        className={`${btn} ${page > 1 ? "bg-brown-900/10 text-brown-950 hover:bg-brown-900/15" : "pointer-events-none bg-brown-900/5 text-brown-800/30"}`}
      >
        ← Precedenti
      </a>
      <span className="text-xs font-semibold text-brown-800/60">
        Pagina {page} di {pageCount}
      </span>
      <a
        href={page < pageCount ? href(page + 1) : undefined}
        aria-disabled={page >= pageCount}
        className={`${btn} ${page < pageCount ? "bg-brown-900/10 text-brown-950 hover:bg-brown-900/15" : "pointer-events-none bg-brown-900/5 text-brown-800/30"}`}
      >
        Successivi →
      </a>
    </div>
  );
}

export function euro(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `€ ${(cents / 100).toFixed(2)}`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}
