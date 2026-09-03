import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";

/** "← Back to <section>" link above a detail/create page's header. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="tap mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brown-800/70 hover:text-brown-950 print:hidden"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}

/**
 * "Cronologia" — everything the activity log recorded about one record.
 *
 * The log has always been able to link *out* to an order, product or booking.
 * Nothing pointed back, and no filter could express "this record", so answering
 * "who changed this price?" meant copying an id into a search box. Admin-only,
 * like the log itself, so the caller decides whether to render it.
 */
export function HistoryLink({ id, className = "" }: { id: string; className?: string }) {
  return (
    <Link
      href={`/admin/audit?record=${encodeURIComponent(id)}`}
      className={`tap inline-flex items-center gap-1.5 text-[12px] font-bold tracking-widest text-brown-800/70 uppercase hover:text-brown-950 print:hidden ${className}`}
    >
      <ScrollText className="size-3.5" />
      Cronologia
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

/**
 * The stand-in for a list while its rows are being fetched.
 *
 * Every list page used to be one server component, so changing a single filter
 * dropped the whole route into `loading.tsx` — header, toolbar, active-filter
 * chips and saved views all replaced by three grey blocks, including the control
 * the operator had just used. The rows now sit behind their own Suspense
 * boundary and this is what shows there: the panel keeps its shape, and the
 * chrome above it never moves.
 */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-2xl border border-brown-900/10 bg-surface shadow-sm"
    >
      <div className="border-b border-brown-900/10 px-5 py-3.5">
        <div className="h-3 w-32 animate-pulse rounded bg-brown-950/10" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-brown-900/5 px-5 py-4 last:border-0">
          <div className="h-3 w-24 animate-pulse rounded bg-brown-950/10" />
          <div className="h-3 flex-1 animate-pulse rounded bg-brown-950/5" />
          <div className="h-3 w-16 animate-pulse rounded bg-brown-950/10" />
        </div>
      ))}
      <span className="sr-only">Caricamento dei risultati…</span>
    </div>
  );
}

export function AdminHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  /** A node, not a string: the row count in most list subtitles comes from the
   *  same query as the rows, so it streams in behind its own boundary rather
   *  than holding the header back. */
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
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
  // A category switched off the storefront — neutral, not an error.
  hidden: "bg-brown-900/10 text-brown-800",
  // A product switched off (worth a glance) and one taken out of the catalogue
  // altogether (neutral: it is where it was put).
  inactive: "bg-warn-soft text-warn-soft-fg",
  archived: "bg-brown-900/10 text-brown-800",
  // Discount codes that are switched on but not redeemable: waiting for their
  // start date (worth a glance), past their end date or out of uses (neutral).
  scheduled: "bg-warn-soft text-warn-soft-fg",
  expired: "bg-brown-900/10 text-brown-800",
  exhausted: "bg-brown-900/10 text-brown-800",
};

/** Italian labels for the raw enum values stored in the DB.
 *
 * Written for the *booking*, which is what first needed them: «prenotazione» is
 * feminine, so `confirmed`/`cancelled` read "Confermata"/"Annullata". Entities
 * whose noun is masculine share the enum but not the agreement — see
 * `orderStatusLabel` below and `redemptionStatusLabel` in RedemptionStatusForm.
 */
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
  inactive: "Disattivato",
  archived: "Archiviato",
  scheduled: "Programmato",
  expired: "Scaduto",
  exhausted: "Esaurito",
  hidden: "Nascosta",
};

export function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

/**
 * The same states, agreeing with «ordine».
 *
 * Only `cancelled` actually differs today — the shared map's "Annullata" was
 * showing on seven order surfaces — but the whole enum is spelled out so the
 * next value added to `orders.status` has to be considered here rather than
 * silently inheriting a booking's gender.
 */
const orderStatusLabels: Record<string, string> = {
  pending: "In attesa",
  paid: "Pagato",
  fulfilled: "Evaso",
  cancelled: "Annullato",
  refunded: "Rimborsato",
};

export function orderStatusLabel(status: string): string {
  return orderStatusLabels[status] ?? statusLabel(status);
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

/**
 * `label` overrides the shared wording for an entity whose states reuse an
 * enum value but not its meaning — a redemption is "consegnato", not "evaso".
 */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold tracking-widest uppercase ${
        badgeStyles[status] ?? "bg-brown-900/10 text-brown-800"
      }`}
    >
      {label ?? statusLabels[status] ?? status}
    </span>
  );
}

/** `StatusBadge` for an order's own status — the one surface that must not use
 *  the booking wording. Payment status (`unpaid`/`paid`/`refunded`) reads the
 *  same either way, so it stays on the plain badge. */
export function OrderStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} label={orderStatusLabel(status)} />;
}

/** Every text input, select and textarea in the gestionale.
 *
 * `min-h-11` is the 44px touch floor — `py-2.5` alone left a 40px control, and
 * the fields sit in dense rows where a mis-tap lands on the neighbouring one.
 * Under 768px `globals.css` also forces these to 16px, without which iOS Safari
 * zooms the viewport in on focus and never zooms back out. */
export const inputCls =
  "w-full min-h-11 rounded-lg border border-brown-900/15 bg-cream/40 px-3 py-2.5 text-sm text-brown-950 focus:border-gold-dark focus:outline-none";

export const labelCls = "mb-1.5 block text-[12px] font-bold tracking-widest text-brown-800/70 uppercase";

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

/**
 * The page numbers to draw for a paginator: first, last, a window around the
 * current page, and `null` where a run was elided.
 *
 * Kept out of the component and exported so `test/pagination.test.ts` can pin
 * the shape — the windowing is the only part with edge cases (near either end
 * the window slides rather than shrinking, so the control never changes width).
 */
export function pageWindow(page: number, pageCount: number, span = 2): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  // Slide the window rather than letting it shrink, so the same *count* of page
  // numbers is offered wherever you are. Clamping it instead drew a control two
  // numbers narrower at either end, and the buttons moved under the pointer as
  // you paged through. (One ellipsis slot still comes and goes at the ends;
  // that is a two-character gap, not a button.)
  const start = Math.min(Math.max(2, page - span), pageCount - 2 * span - 1);
  const end = Math.max(Math.min(pageCount - 1, page + span), 2 * span + 2);
  const out: (number | null)[] = [1];
  if (start > 2) out.push(null);
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pageCount - 1) out.push(null);
  out.push(pageCount);
  return out;
}

/**
 * Paginator for the admin lists, preserving the current query string.
 *
 * Numbered, not just prev/next: at 25 rows a page the activity log runs to 31
 * pages and the orders list to 24, so "go to the oldest" was thirty clicks and
 * "go back to where I was" was unanswerable. First and last are always drawn,
 * with a window around the current page and an ellipsis over what is skipped.
 *
 * `pageParam` lets a page host two independent paginators (e.g. "page" + "rpage").
 */
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
  const btn =
    "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase";
  const num =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-xs font-bold tabular-nums";
  // A disabled control is exempt from the 4.5:1 floor, but at /30 these arrows
  // were invisible rather than merely quiet. /60 reads as unavailable next to
  // the /70 the rest of the page now uses, and can still be seen.
  const arrowOff = "pointer-events-none bg-brown-900/5 text-brown-800/60";
  const arrowOn = "bg-brown-900/10 text-brown-950 hover:bg-brown-900/15";

  // `Link`, not a bare `<a>`. Every other control on these lists — the sort
  // headers, the status chips, the active-filter pills — is a client
  // transition; paging was the one that tore the document down and rebuilt it,
  // which is both the slowest way to move through a list and the one thing an
  // operator does most on a list of six hundred orders.
  //
  // An end stop is a `<span>` rather than an `<a>` with no `href`: an anchor
  // without one is not a link, is not focusable, and reads as bare text to a
  // screen reader — `aria-disabled` on it describes a control that was never
  // there. A span says the same thing honestly.
  // A plain function, called directly below rather than rendered as `<Arrow/>`:
  // a component declared inside a render is a new type on every pass, which
  // remounts its subtree — and the project's lint rule says so.
  const arrow = (to: number, enabled: boolean, children: ReactNode) =>
    enabled ? (
      <Link href={href(to)} className={`${btn} ${arrowOn}`}>
        {children}
      </Link>
    ) : (
      <span aria-hidden className={`${btn} ${arrowOff}`}>
        {children}
      </span>
    );

  return (
    <nav
      aria-label="Paginazione"
      className="mt-6 flex flex-wrap items-center justify-between gap-3 print:hidden"
    >
      {arrow(page - 1, page > 1, "← Precedenti")}

      {/* Scrolls rather than wraps: on a phone a 31-page control would
          otherwise push the rest of the page down by three rows of pills.
          `.scroll-x` for the affordance — the same shadow the tables use, with
          the page's own ground rather than a panel's. */}
      <div className="scroll-x no-scrollbar order-last w-full py-1 sm:order-none sm:w-auto [--scroll-ground:var(--color-cream)]">
        <ol className="flex items-center justify-center gap-1">
          {pageWindow(page, pageCount).map((p, i) =>
            p === null ? (
              <li key={`gap${i}`} aria-hidden className="px-1 text-xs text-brown-800/70">
                …
              </li>
            ) : (
              <li key={p}>
                <Link
                  href={href(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Pagina ${p} di ${pageCount}`}
                  className={`${num} ${
                    p === page
                      ? "bg-brown-950 text-cream"
                      : "text-brown-800/70 hover:bg-brown-900/10 hover:text-brown-950"
                  }`}
                >
                  {p}
                </Link>
              </li>
            ),
          )}
        </ol>
      </div>

      {arrow(page + 1, page < pageCount, "Successivi →")}
    </nav>
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
