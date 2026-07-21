import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, inputCls, fmtDate, Pagination } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getReservationsPage, adminGetShops } from "@/lib/admin/queries";
import { updateReservationStatus, promoteFromWaitlist } from "@/lib/admin/actions";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  table: "Tavolo",
  porchetta: "Porchetta",
  order: "Ordine",
};
const FILTERS = ["all", "pending", "confirmed", "completed", "cancelled"];

type SP = { searchParams: Promise<{ stato?: string; negozio?: string; page?: string }> };

export default async function AdminReservations({ searchParams }: SP) {
  const { stato = "all", negozio = "all", page: pageStr } = await searchParams;
  const page = Number(pageStr) || 1;
  const [{ rows, total, pageCount }, shops, admin] = await Promise.all([
    getReservationsPage({ status: stato, shopSlug: negozio, page }),
    adminGetShops(),
    isAdmin(),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  const filterHref = (next: { stato?: string; negozio?: string }) => {
    const s = next.stato ?? stato;
    const n = next.negozio ?? negozio;
    return `/admin/reservations?stato=${s}&negozio=${n}`;
  };

  return (
    <div>
      <AdminHeader
        title="Prenotazioni"
        subtitle={`${total} richieste`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/reservations/agenda"
              className="rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
            >
              Agenda / prep
            </Link>
            {admin ? (
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- API download route, not a page
              <a
                href="/api/admin/export/reservations"
                download
                className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Esporta CSV
              </a>
            ) : null}
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={filterHref({ stato: f })}
            className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              stato === f ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {f === "all" ? "Tutte" : f}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={filterHref({ negozio: "all" })}
          className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
            negozio === "all" ? "bg-gold text-brown-950" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
          }`}
        >
          Tutte le sedi
        </Link>
        {shops.map((s) => (
          <Link
            key={s.slug}
            href={filterHref({ negozio: s.slug })}
            className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              negozio === s.slug ? "bg-gold text-brown-950" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna prenotazione in questa vista.</p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <Panel key={r.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-xs font-bold text-brown-800/60">{r.reference}</span>
                    <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-bold tracking-widest text-gold-deep uppercase">
                      {TYPE_LABEL[r.type] ?? r.type}
                    </span>
                    <StatusBadge status={r.status} />
                    {r.waitlisted && (
                      <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold tracking-widest text-amber-700 uppercase">
                        Lista d&apos;attesa
                      </span>
                    )}
                  </div>
                  <p className="font-display text-xl text-brown-950">{r.name}</p>
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

                <div className="w-full shrink-0 space-y-2 lg:w-64">
                  {r.waitlisted && r.type === "porchetta" && (
                    <ActionForm action={promoteFromWaitlist}>
                      <input type="hidden" name="id" value={r.id} />
                      <PendingButton tone="gold">Conferma dalla lista</PendingButton>
                    </ActionForm>
                  )}
                  <ActionForm action={updateReservationStatus} className="space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <select name="status" defaultValue={r.status} className={inputCls}>
                      <option value="pending">In attesa</option>
                      <option value="confirmed">Confermata</option>
                      <option value="completed">Completata</option>
                      <option value="cancelled">Annullata</option>
                    </select>
                    <input
                      name="adminNotes"
                      defaultValue={r.adminNotes ?? ""}
                      placeholder="Note interne"
                      className={inputCls}
                    />
                    <PendingButton tone="dark">Aggiorna</PendingButton>
                  </ActionForm>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath="/admin/reservations" page={page} pageCount={pageCount} params={{ stato, negozio }} />
    </div>
  );
}
