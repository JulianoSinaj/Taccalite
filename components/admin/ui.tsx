import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** "← Back to <section>" link above a detail/create page's header. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 hover:text-brown-950 print:hidden"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}

/** The pill link used for the primary "+ New …" action in a list header. */
export function NewButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-on-gold uppercase hover:bg-gold-dark"
    >
      {children}
    </Link>
  );
}

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
    <div className={`rounded-2xl border border-brown-900/10 bg-surface p-4 shadow-sm sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

const badgeStyles: Record<string, string> = {
  pending: "bg-warn-soft text-warn-soft-fg",
  confirmed: "bg-ok-soft text-ok-soft-fg",
  completed: "bg-brown-900/10 text-brown-800",
  cancelled: "bg-danger-soft text-danger-soft-fg",
  // Distinct from cancelled *and* from pending — an operator scanning the list
  // needs to tell a courteous cancellation, a booking still awaiting an answer,
  // and a customer who simply never showed up apart at a glance. Amber/orange
  // no longer separate them once both map to `warn`, so this one carries a ring.
  no_show: "bg-warn-soft text-warn-soft-fg ring-1 ring-warn/50",
  paid: "bg-ok-soft text-ok-soft-fg",
  fulfilled: "bg-ok-soft text-ok-soft-fg",
  refunded: "bg-danger-soft text-danger-soft-fg",
  unpaid: "bg-warn-soft text-warn-soft-fg",
  queued: "bg-warn-soft text-warn-soft-fg",
  sent: "bg-ok-soft text-ok-soft-fg",
  failed: "bg-danger-soft text-danger-soft-fg",
  confirmedSub: "bg-ok-soft text-ok-soft-fg",
  unsubscribed: "bg-danger-soft text-danger-soft-fg",
};

/** Italian labels for the raw enum values stored in the DB. */
const statusLabels: Record<string, string> = {
  pending: "In attesa",
  confirmed: "Confermata",
  completed: "Completata",
  cancelled: "Annullata",
  no_show: "Non presentato",
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

/** The three reservation kinds, in the order they're offered to an operator. */
export const RESERVATION_TYPES = [
  { value: "table", label: "Tavolo" },
  { value: "porchetta", label: "Porchetta" },
  { value: "order", label: "Ordine speciale" },
] as const;

const reservationTypeLabels: Record<string, string> = {
  table: "Tavolo",
  porchetta: "Porchetta",
  order: "Ordine",
};

export function reservationTypeLabel(type: string): string {
  return reservationTypeLabels[type] ?? type;
}

/** Account roles, for badges and selects. */
const roleLabels: Record<string, string> = {
  customer: "Cliente",
  staff: "Staff",
  admin: "Amministratore",
};

export function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
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

/** Every text input, select and textarea in the gestionale.
 *
 * `min-h-11` is the 44px touch floor — `py-2.5` alone left a 40px control, and
 * the fields sit in dense rows where a mis-tap lands on the neighbouring one.
 * Under 768px `globals.css` also forces these to 16px, without which iOS Safari
 * zooms the viewport in on focus and never zooms back out. */
export const inputCls =
  "w-full min-h-11 rounded-lg border border-brown-900/15 bg-cream/40 px-3 py-2.5 text-sm text-brown-950 focus:border-gold-dark focus:outline-none";

export const labelCls = "mb-1.5 block text-[11px] font-bold tracking-widest text-brown-800/70 uppercase";

export function SubmitButton({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "dark" | "danger" }) {
  const tones = {
    gold: "bg-gold text-on-gold hover:bg-gold-dark",
    dark: "bg-brown-950 text-cream hover:bg-brown-900",
    danger: "bg-danger-solid text-danger-solid-fg hover:brightness-110",
  };
  return (
    <button
      type="submit"
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors ${tones[tone]}`}
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
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
      >
        Cerca
      </button>
    </form>
  );
}

/** Prev/next pagination that preserves the current query string.
 *  `pageParam` lets a page host two independent paginators (e.g. "page" + "rpage"). */
export function Pagination({
  basePath,
  page,
  pageCount,
  params = {},
  pageParam = "page",
}: {
  basePath: string;
  page: number;
  pageCount: number;
  params?: Record<string, string | undefined>;
  pageParam?: string;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set(pageParam, String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase";
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

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
