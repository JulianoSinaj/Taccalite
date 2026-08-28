import Link from "next/link";
import { Suspense } from "react";
import {
  AdminHeader,
  Panel,
  StatusBadge,
  TableSkeleton,
  inputCls,
  labelCls,
  fmtDate,
  Pagination,
  reservationTypeLabel,
  euro,
} from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import {
  SegmentedFilter,
  FilterToolbar,
  ActiveFilters,
  labelFrom,
} from "@/components/admin/FilterBar";
import {
  getReservationsPage,
  adminGetShops,
  getSavedViews,
  getHeldDeposits,
  getDepositsAwaitingOutcome,
  countExpiredReservations,
} from "@/lib/admin/queries";
import { reservationFilters, filterQuery } from "@/lib/admin/filters";
import { TotalSubtitle } from "@/components/admin/Streamed";
import { BulkBar, BulkCheckbox } from "@/components/admin/BulkBar";
import { SavedViews } from "@/components/admin/SavedViews";
import {
  updateReservationStatus,
  promoteFromWaitlist,
  bulkUpdateReservationStatus,
} from "@/lib/admin/reservation-actions";
import { isAdmin, getCurrentUser } from "@/lib/auth/session";
import { shopScope, lockShop, shopChips } from "@/lib/admin/scope";
import { dateInRome } from "@/lib/time";
import { getClosures } from "@/lib/db/queries";
import { closureFor, closureTimeLabel } from "@/lib/closures";
import type { ReservationRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Ties the row checkboxes to the bulk bar's form (see BulkBar). */
const BULK_FORM = "bulk-reservations";

const BASE = "/admin/reservations";

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tutte" },
  { value: "pending", label: "In attesa" },
  { value: "confirmed", label: "Confermate" },
  { value: "waitlist", label: "Lista d'attesa" },
  { value: "scadute", label: "Scadute" },
  { value: "completed", label: "Completate" },
  { value: "cancelled", label: "Annullate" },
  { value: "no_show", label: "Non presentati" },
];
const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "table", label: "Tavolo" },
  { value: "porchetta", label: "Porchetta" },
  { value: "order", label: "Ordine" },
];

const BTN_SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

/**
 * The deposit in one line. Same words as the detail page, so a booking reads
 * the same in the list as on its own screen.
 */
function depositLine(r: ReservationRow): { text: string; cls: string } | null {
  if (r.depositCents <= 0) return null;
  const amt = euro(r.depositCents);
  if (r.depositRefundedAt) return { text: `Acconto ${amt} rimborsato`, cls: "text-brown-800/70" };
  if (r.depositForfeitedAt) return { text: `Acconto ${amt} trattenuto`, cls: "font-medium text-warn" };
  if (!r.depositPaidAt) return { text: `Acconto ${amt} da incassare`, cls: "text-brown-800/70" };
  if (r.status === "cancelled") {
    return { text: `Acconto ${amt} incassato — da definire (rimborso o trattenuta)`, cls: "font-medium text-danger" };
  }
  return { text: `Acconto ${amt} incassato`, cls: "text-ok" };
}

type SP = {
  searchParams: Promise<{
    stato?: string;
    negozio?: string;
    tipo?: string;
    q?: string;
    da?: string;
    a?: string;
    page?: string;
  }>;
};

export default async function AdminReservations({ searchParams }: SP) {
  const sp = await searchParams;
  const { stato = "all", tipo = "all", q = "", da = "", a = "" } = sp;
  const page = Number(sp.page) || 1;
  // A staff account assigned to a location is *confined* to it: the facet is
  // forced here rather than merely pre-selected, so editing the query string
  // cannot widen the view. Admins and unassigned accounts see everything.
  const scope = await shopScope();
  const filters = reservationFilters({ ...sp, negozio: lockShop(sp.negozio, scope) });
  const viewer = await getCurrentUser();
  const today = dateInRome();
  const closures = await getClosures(today);
  // Started, not awaited — see components/admin/Streamed.
  const promise = getReservationsPage({ ...filters, page });
  const [shops, admin, views, deposits, undecided, expired] =
    await Promise.all([
      adminGetShops(),
      isAdmin(),
      viewer ? getSavedViews(viewer.id, BASE) : Promise.resolve([]),
      // Caparre were editable per booking and totalled nowhere, so "quanto
      // abbiamo in acconti?" had no answer short of adding up rows by eye.
      getHeldDeposits(scope),
      getDepositsAwaitingOutcome(scope),
      countExpiredReservations(scope),
    ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  // All active filters, so the filter chrome and pagination preserve one another.
  // The locked shop, not the requested one — see the same note on the orders
  // list. A chip that highlights without changing the results is worse than one
  // that isn't there.
  const current = { stato, negozio: filters.negozio ?? "all", tipo, q, da, a };
  const SHOP_CHIPS = shopChips(shops, scope);

  // The count streams in; the deposits line does not depend on the row query.
  const depositLine =
    deposits.cents > 0
      ? ` · ${euro(deposits.cents)} di acconti incassati su ${deposits.count} ${
          deposits.count === 1 ? "prenotazione aperta" : "prenotazioni aperte"
        }`
      : "";

  return (
    <div>
      <AdminHeader
        title="Prenotazioni"
        subtitle={
          <TotalSubtitle
            promise={promise}
            one="prenotazione"
            many="prenotazioni"
            suffix={depositLine}
          />
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/reservations/new"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-4 py-2 text-xs font-bold tracking-widest text-on-gold uppercase hover:bg-gold-dark"
            >
              + Nuova prenotazione
            </Link>
            <Link href="/admin/reservations/calendar" className={BTN_SECONDARY}>
              Calendario
            </Link>
            <Link
              href="/admin/reservations/agenda"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
            >
              Agenda / prep
            </Link>
            {admin ? (
              <a
                href={`/api/admin/export/reservations${filterQuery(filters)}`}
                download
                className={BTN_SECONDARY}
              >
                Esporta CSV
              </a>
            ) : null}
          </div>
        }
      />

      {/* Two things that need a decision and would otherwise hide inside the
          rows: bookings whose day passed with nobody closing them, and paid
          deposits on cancelled bookings nobody has refunded or kept yet. */}
      {(expired > 0 && stato !== "scadute") || undecided.count > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {expired > 0 && stato !== "scadute" && (
            <Link
              href={`${BASE}?stato=scadute`}
              className="rounded-lg bg-warn-soft px-4 py-2 text-sm font-medium text-warn-soft-fg hover:underline"
            >
              {expired} {expired === 1 ? "prenotazione scaduta" : "prenotazioni scadute"} da chiudere →
            </Link>
          )}
          {undecided.count > 0 && (
            <Link
              href={`${BASE}?stato=cancelled`}
              className="rounded-lg bg-danger-soft px-4 py-2 text-sm font-medium text-danger-soft-fg hover:underline"
            >
              {euro(undecided.cents)} di acconti da definire su {undecided.count}{" "}
              {undecided.count === 1 ? "prenotazione annullata" : "prenotazioni annullate"} →
            </Link>
          )}
        </div>
      ) : null}

      {/* Triage state is what an operator flips through all morning; kind, shop
          and the date range are how they narrow a search. */}
      <SegmentedFilter
        basePath={BASE}
        params={current}
        name="stato"
        options={FILTERS}
        label="Filtra per stato prenotazione"
      />

      <FilterToolbar
        basePath={BASE}
        params={current}
        searchPlaceholder="Riferimento, nome, telefono, email…"
        carry={["stato"]}
        formId="reservations-filters"
        facets={[
          { name: "tipo", label: "Tipo", options: TYPE_FILTERS },
          { name: "negozio", label: "Sede", options: SHOP_CHIPS },
        ]}
      >
        <div>
          <label className={labelCls} htmlFor="res-da">
            Dal
          </label>
          <input id="res-da" type="date" name="da" defaultValue={da} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="res-a">
            Al
          </label>
          <input id="res-a" type="date" name="a" defaultValue={a} className={inputCls} />
        </div>
      </FilterToolbar>

      <ActiveFilters
        basePath={BASE}
        params={current}
        labels={{
          stato: { title: "Stato", format: labelFrom(FILTERS) },
          tipo: { title: "Tipo", format: labelFrom(TYPE_FILTERS) },
          negozio: { title: "Sede", format: labelFrom(SHOP_CHIPS) },
          da: { title: "Dal" },
          a: { title: "Al" },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      <SavedViews path={BASE} views={views} currentQuery={filterQuery(filters).replace(/^\?/, "")} />

      {/* Only the bookings wait on the query; the filters above stay put. */}
      <Suspense key={filterQuery({ ...current, page: String(page) })} fallback={<TableSkeleton rows={6} />}>
        <ReservationList
          promise={promise}
          shopName={shopName}
          closures={closures}
          today={today}
          page={page}
          current={current}
        />
      </Suspense>
    </div>
  );
}


async function ReservationList({
  promise,
  shopName,
  closures,
  today,
  page,
  current,
}: {
  promise: ReturnType<typeof getReservationsPage>;
  shopName: Map<string, string>;
  closures: Awaited<ReturnType<typeof getClosures>>;
  today: string;
  page: number;
  current: Record<string, string | undefined>;
}) {
  const { rows, pageCount } = await promise;
  return (
    <>
          {rows.length === 0 ? (
            <Panel>
              <p className="text-brown-800/70">Nessuna prenotazione in questa vista.</p>
            </Panel>
          ) : (
            <>
              <BulkBar
                formId={BULK_FORM}
                action={bulkUpdateReservationStatus}
                label="prenotazioni"
                options={[
                  { value: "confirmed", label: "Conferma" },
                  { value: "completed", label: "Segna completate" },
                  { value: "cancelled", label: "Annulla" },
                  { value: "no_show", label: "Segna non presentati" },
                  { value: "pending", label: "Rimetti in attesa" },
                ]}
                confirmTemplate="Applicare l'azione a {n} prenotazioni? I clienti con email riceveranno l'avviso."
              />

              {/* One row = the facts and the one or two clicks the state calls for.
                  Everything else — reschedule, deposit, table, notes, emails — is on
                  the booking's own page, which every row links to. The row used to
                  carry a copy of all of it, which made the list unreadable on a
                  phone and gave the same action two homes. */}
              <div className="space-y-4">
                {rows.map((r) => {
                  const open = r.status === "pending" || r.status === "confirmed";
                  const isPast = r.date < today;
                  const deposit = depositLine(r);
                  // A live booking on a day the shop has since closed: the one row
                  // in the list that needs a phone call, and it looked like any other.
                  const closed =
                    open && !isPast ? closureFor(closures, r.shopSlug, r.date, "reservations", r.time || undefined) : null;
                  return (
                    <Panel key={r.id}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <BulkCheckbox
                            formId={BULK_FORM}
                            id={r.id}
                            label={`Seleziona prenotazione ${r.reference}`}
                          />
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-brown-800/70">{r.reference}</span>
                              <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-bold tracking-widest text-gold-deep uppercase">
                                {reservationTypeLabel(r.type)}
                              </span>
                              <StatusBadge status={r.status} />
                              {open && isPast && (
                                <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-warn-soft-fg uppercase">
                                  Scaduta
                                </span>
                              )}
                              {closed && (
                                <span
                                  className="rounded-full bg-danger-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-danger-soft-fg uppercase"
                                  title={closed.reason || undefined}
                                >
                                  Giorno chiuso{closureTimeLabel(closed) ? ` ${closureTimeLabel(closed)}` : ""}
                                </span>
                              )}
                              {r.waitlisted && r.status !== "cancelled" && (
                                <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-warn uppercase">
                                  Lista d&apos;attesa
                                </span>
                              )}
                              {r.remindedAt && (
                                <span className="rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-info-soft-fg uppercase">
                                  Promemoria inviato
                                </span>
                              )}
                              {r.readyAt && (
                                <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-bold tracking-widest text-ok uppercase">
                                  Pronta ✓
                                </span>
                              )}
                            </div>

                            <Link
                              href={`/admin/reservations/${r.id}`}
                              className="font-display inline-block text-xl text-brown-950 hover:underline"
                            >
                              {r.name}
                            </Link>

                            <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-brown-800/80 sm:grid-cols-2">
                              <p>
                                <span aria-hidden="true">📅</span> <span className="sr-only">Data: </span>
                                {fmtDate(r.date)}
                                {r.time ? ` · ${r.time}` : ""}
                              </p>
                              <p>
                                <span aria-hidden="true">🏬</span> <span className="sr-only">Negozio: </span>
                                {shopName.get(r.shopSlug) ?? r.shopSlug}
                              </p>
                              <p>
                                <span aria-hidden="true">📞</span> <span className="sr-only">Telefono: </span>
                                {r.phone}
                              </p>
                              {r.email && (
                                <p className="truncate">
                                  <span aria-hidden="true">✉️</span> <span className="sr-only">Email: </span>
                                  {r.email}
                                </p>
                              )}
                              {r.guests != null && (
                                <p>
                                  <span aria-hidden="true">👥</span> <span className="sr-only">Ospiti: </span>
                                  {r.guests} ospiti
                                  {r.tableNumber ? ` · tav. ${r.tableNumber}` : ""}
                                </p>
                              )}
                              {r.quantityKg != null && (
                                <p>
                                  <span aria-hidden="true">⚖️</span> <span className="sr-only">Quantità: </span>
                                  {r.quantityKg} kg
                                </p>
                              )}
                            </div>

                            {r.notes && (
                              <p className="max-w-2xl text-sm text-brown-800/70">
                                <span aria-hidden="true">📝</span> <span className="sr-only">Note: </span>
                                {r.notes}
                              </p>
                            )}
                            {r.adminNotes && (
                              <p className="max-w-2xl rounded-lg bg-gold/10 px-3 py-1.5 text-sm text-brown-900">
                                <span className="text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">
                                  Nota interna
                                </span>{" "}
                                {r.adminNotes}
                              </p>
                            )}
                            {deposit && <p className={`text-xs ${deposit.cls}`}>{deposit.text}</p>}
                          </div>
                        </div>

                        {/* The clicks this state calls for, and the way to the rest. */}
                        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-56">
                          {r.waitlisted && r.type === "porchetta" && r.status !== "cancelled" && (
                            <ActionForm action={promoteFromWaitlist}>
                              <input type="hidden" name="id" value={r.id} />
                              <PendingButton tone="gold">Conferma dalla lista</PendingButton>
                            </ActionForm>
                          )}

                          {open && (
                            <div className="flex gap-2">
                              {r.status === "pending" ? (
                                <ActionForm action={updateReservationStatus} className="flex-1">
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="status" value="confirmed" />
                                  <PendingButton tone="gold">Conferma</PendingButton>
                                </ActionForm>
                              ) : (
                                <ActionForm action={updateReservationStatus} className="flex-1">
                                  <input type="hidden" name="id" value={r.id} />
                                  <input type="hidden" name="status" value="completed" />
                                  <PendingButton tone="dark">Completata</PendingButton>
                                </ActionForm>
                              )}
                              <ActionForm action={updateReservationStatus} className="flex-1">
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="status" value="cancelled" />
                                <PendingButton
                                  tone="danger"
                                  confirm={
                                    r.email
                                      ? "Annullare questa prenotazione? Il cliente riceverà un'email."
                                      : "Annullare questa prenotazione?"
                                  }
                                >
                                  Annulla
                                </PendingButton>
                              </ActionForm>
                            </div>
                          )}

                          {/* Past its day and never closed: the one outcome the
                              quick buttons above cannot express. */}
                          {open && isPast && (
                            <ActionForm action={updateReservationStatus}>
                              <input type="hidden" name="id" value={r.id} />
                              <input type="hidden" name="status" value="no_show" />
                              <PendingButton
                                tone="danger"
                                confirm={
                                  r.depositPaidAt && r.depositCents > 0
                                    ? "Segnare come non presentato? L'acconto incassato verrà trattenuto."
                                    : "Segnare come non presentato?"
                                }
                              >
                                Non presentato
                              </PendingButton>
                            </ActionForm>
                          )}

                          <Link href={`/admin/reservations/${r.id}`} className={BTN_SECONDARY}>
                            Apri scheda →
                          </Link>
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </>
          )}

          <Pagination basePath={BASE} page={page} pageCount={pageCount} params={current} />
      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={current} />
    </>
  );
}