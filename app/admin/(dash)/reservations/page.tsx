import Link from "next/link";
import {
  AdminHeader,
  Panel,
  StatusBadge,
  inputCls,
  labelCls,
  fmtDate,
  Pagination,
  reservationTypeLabel,
} from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { ReservationForm } from "@/components/admin/ReservationForm";
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
} from "@/lib/admin/queries";
import { euro } from "@/components/admin/ui";
import { reservationFilters, filterQuery } from "@/lib/admin/filters";
import { BulkBar, BulkCheckbox } from "@/components/admin/BulkBar";
import { SavedViews } from "@/components/admin/SavedViews";
import {
  updateReservationStatus,
  promoteFromWaitlist,
  setReservationDeposit,
  bulkUpdateReservationStatus,
} from "@/lib/admin/reservation-actions";
import { isAdmin, getCurrentUser } from "@/lib/auth/session";
import { shopScope, lockShop, shopChips } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

/** Ties the row checkboxes to the bulk bar's form (see BulkBar). */
const BULK_FORM = "bulk-reservations";

const BASE = "/admin/reservations";

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tutte" },
  { value: "pending", label: "In attesa" },
  { value: "confirmed", label: "Confermate" },
  { value: "waitlist", label: "Lista d'attesa" },
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
  const [{ rows, total, pageCount }, shops, admin, views, deposits] = await Promise.all([
    getReservationsPage({ ...filters, page }),
    adminGetShops(),
    isAdmin(),
    viewer ? getSavedViews(viewer.id, BASE) : Promise.resolve([]),
    // Caparre were editable per booking and totalled nowhere, so "quanto
    // abbiamo in acconti?" had no answer short of adding up rows by eye.
    getHeldDeposits(scope),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  // All active filters, so the filter chrome and pagination preserve one another.
  // The locked shop, not the requested one — see the same note on the orders
  // list. A chip that highlights without changing the results is worse than one
  // that isn't there.
  const current = { stato, negozio: filters.negozio ?? "all", tipo, q, da, a };
  const SHOP_CHIPS = shopChips(shops, scope);

  return (
    <div>
      <AdminHeader
        title="Prenotazioni"
        subtitle={
          deposits.cents > 0
            ? `${total} richieste · ${euro(deposits.cents)} di acconti trattenuti su ${deposits.count} ${
                deposits.count === 1 ? "prenotazione" : "prenotazioni"
              }`
            : `${total} richieste`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/reservations/new"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-4 py-2 text-xs font-bold tracking-widest text-on-gold uppercase hover:bg-gold-dark"
            >
              + Nuova prenotazione
            </Link>
            <Link
              href="/admin/reservations/calendar"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
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
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Esporta CSV
              </a>
            ) : null}
          </div>
        }
      />

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
        <div className="space-y-4">
          {rows.map((r) => (
            <Panel key={r.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-3">
                <BulkCheckbox formId={BULK_FORM} id={r.id} label={`Seleziona prenotazione ${r.reference}`} />
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs font-bold text-brown-800/60">{r.reference}</span>
                    <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-bold tracking-widest text-gold-deep uppercase">
                      {reservationTypeLabel(r.type)}
                    </span>
                    <StatusBadge status={r.status} />
                    {r.waitlisted && (
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
                  {/* The list had no route to a booking's own page at all: the
                      detail screen was reachable from the calendar, the agenda
                      and the customer 360, but not from the list you actually
                      search in. Linking the name matches how the orders list
                      hangs its detail link off the order number. */}
                  <Link
                    href={`/admin/reservations/${r.id}`}
                    className="font-display inline-block text-xl text-brown-950 hover:underline"
                  >
                    {r.name}
                  </Link>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-brown-800/80 sm:grid-cols-2">
                    <p>
                      <span aria-hidden="true">📞</span> <span className="sr-only">Telefono: </span>
                      {r.phone}
                    </p>
                    {r.email && (
                      <p>
                        <span aria-hidden="true">✉️</span> <span className="sr-only">Email: </span>
                        {r.email}
                      </p>
                    )}
                    <p>
                      <span aria-hidden="true">📅</span> <span className="sr-only">Data: </span>
                      {fmtDate(r.date)} {r.time ? `· ${r.time}` : ""}
                    </p>
                    <p>
                      <span aria-hidden="true">🏬</span> <span className="sr-only">Negozio: </span>
                      {shopName.get(r.shopSlug) ?? r.shopSlug}
                    </p>
                    {r.guests != null && (
                      <p>
                        <span aria-hidden="true">👥</span> <span className="sr-only">Ospiti: </span>
                        {r.guests} ospiti
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
                    <p className="mt-1 max-w-2xl text-sm text-brown-800/70">
                      <span aria-hidden="true">📝</span> <span className="sr-only">Note: </span>
                      {r.notes}
                    </p>
                  )}
                </div>
                </div>

                <div className="w-full shrink-0 space-y-2 lg:w-64">
                  {r.waitlisted && r.type === "porchetta" && (
                    <ActionForm action={promoteFromWaitlist}>
                      <input type="hidden" name="id" value={r.id} />
                      <PendingButton tone="gold">Conferma dalla lista</PendingButton>
                    </ActionForm>
                  )}

                  {/* One-click Conferma / Annulla for pending/confirmed reservations. */}
                  {(r.status === "pending" || r.status === "confirmed") && (
                    <div className="flex gap-2">
                      {r.status !== "confirmed" && (
                        <ActionForm action={updateReservationStatus} className="flex-1">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="confirmed" />
                          <PendingButton tone="gold">Conferma</PendingButton>
                        </ActionForm>
                      )}
                      <ActionForm action={updateReservationStatus} className="flex-1">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="cancelled" />
                        <PendingButton tone="danger" confirm="Annullare questa prenotazione? Il cliente riceverà un'email.">
                          Annulla
                        </PendingButton>
                      </ActionForm>
                    </div>
                  )}

                  <ActionForm action={updateReservationStatus} className="space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" defaultValue={r.status} className={inputCls}>
                      <option value="pending">In attesa</option>
                      <option value="confirmed">Confermata</option>
                      <option value="completed">Completata</option>
                      <option value="cancelled">Annullata</option>
                      <option value="no_show">Non presentato</option>
                    </select>
                    <input
                      name="adminNotes"
                      defaultValue={r.adminNotes ?? ""}
                      placeholder="Note interne"
                      className={inputCls}
                    />
                    <PendingButton tone="dark">Aggiorna</PendingButton>
                  </ActionForm>

                  <ActionForm action={setReservationDeposit} className="space-y-2 border-t border-brown-900/10 pt-2">
                    <input type="hidden" name="id" value={r.id} />
                    <label className={labelCls}>Acconto (caparra)</label>
                    <div className="flex items-center gap-2">
                      <input
                        name="depositEuros"
                        type="number"
                        step="0.01"
                        min={0}
                        defaultValue={r.depositCents ? (r.depositCents / 100).toFixed(2) : ""}
                        placeholder="€"
                        className={`${inputCls} w-24`}
                      />
                      <label className="flex items-center gap-1.5 text-xs font-medium text-brown-900">
                        <input type="checkbox" name="paid" defaultChecked={!!r.depositPaidAt} className="h-4 w-4 rounded accent-brown-950" />
                        Incassato
                      </label>
                      <PendingButton tone="dark">Salva</PendingButton>
                    </div>
                    {r.depositCents > 0 && (
                      <p
                        className={`text-xs ${r.depositForfeitedAt ? "font-medium text-warn" : "text-brown-800/60"}`}
                      >
                        {r.depositForfeitedAt
                          ? "⚠ Acconto trattenuto (non presentato)"
                          : r.depositPaidAt
                            ? "✓ Acconto incassato"
                            : "In attesa di incasso"}
                      </p>
                    )}
                  </ActionForm>
                </div>
              </div>

              {/* Reschedule / correct the booking itself. Collapsed so the row
                  stays scannable — status and deposit stay one click away above. */}
              <details className="mt-4 border-t border-brown-900/10 pt-3">
                <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
                  Modifica / sposta prenotazione
                </summary>
                <div className="mt-4">
                  <ReservationForm shops={shops} reservation={r} />
                </div>
              </details>
            </Panel>
          ))}
        </div>
        </>
      )}

      <Pagination
        basePath="/admin/reservations"
        page={page}
        pageCount={pageCount}
        params={current}
      />
    </div>
  );
}
