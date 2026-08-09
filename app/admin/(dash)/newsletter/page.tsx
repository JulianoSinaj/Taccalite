import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, fmtDate, fmtDateTime, Pagination } from "@/components/admin/ui";
import { FilterChips, FilterSearch, chipsFrom } from "@/components/admin/FilterBar";
import { DataTable, DensityToggle, densityFrom } from "@/components/admin/DataTable";
import { ActionForm, PendingButton, DeleteForm } from "@/components/admin/ActionForm";
import { CampaignComposer } from "@/components/admin/CampaignComposer";
import { getSubscribersPage, SUBSCRIBER_SORTS } from "@/lib/admin/queries";
import { subscriberFilters, sortFilters, filterQuery } from "@/lib/admin/filters";
import { removeSubscriber } from "@/lib/admin/actions";
import { duplicateCampaign, deleteCampaign } from "@/lib/admin/campaign-actions";
import { listCampaigns, getCampaign } from "@/lib/newsletter-campaigns";
import { isAdmin } from "@/lib/auth/session";
import type { NewsletterCampaignRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const BASE = "/admin/newsletter";

type SP = {
  searchParams: Promise<{
    page?: string;
    stato?: string;
    origine?: string;
    q?: string;
    campagna?: string;
    colonna?: string;
    verso?: string;
    densita?: string;
  }>;
};

/** Badge for a campaign's lifecycle state. */
function CampaignStatus({ campaign }: { campaign: NewsletterCampaignRow }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Bozza", cls: "bg-brown-900/10 text-brown-800" },
    scheduled: { label: "Programmata", cls: "bg-amber-100 text-amber-800" },
    sent: { label: "Inviata", cls: "bg-emerald-100 text-emerald-800" },
    failed: { label: "Fallita", cls: "bg-red-100 text-red-700" },
  };
  const s = map[campaign.status] ?? map.draft;
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase ${s.cls}`}>
      {s.label}
    </span>
  );
}

const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "confirmed", label: "Confermati" },
  { value: "pending", label: "In attesa" },
  { value: "unsubscribed", label: "Disiscritti" },
];

export default async function AdminNewsletter({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const { stato = "all", origine = "all", q } = sp;
  const filters = subscriberFilters(sp);
  const sort = sortFilters(sp, SUBSCRIBER_SORTS, { colonna: "iscritto", verso: "desc" });
  const density = densityFrom(sp.densita);
  // Carried on every sort/density/page link so the view survives navigation.
  const linkParams = { ...filters, colonna: sort.colonna, verso: sort.verso, densita: sp.densita };
  const [{ rows: subs, total, confirmed, pageCount, sources }, admin, campaigns, editing] =
    await Promise.all([
      getSubscribersPage({ ...filters, page, sort }),
      isAdmin(),
      listCampaigns(),
      sp.campagna ? getCampaign(sp.campagna) : Promise.resolve(null),
    ]);

  return (
    <div>
      <AdminHeader
        title="Newsletter"
        subtitle={`${confirmed} iscritti confermati · ${total} nel filtro attuale`}
        action={
          admin ? (
            <a
              href={`/api/admin/export/subscribers${filterQuery(filters)}`}
              download
              className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Esporta CSV
            </a>
          ) : null
        }
      />

      {/* Composer — a new draft, or the campaign named by ?campagna=<id>. */}
      <details className="mb-6" open={!!editing}>
        <summary className="w-fit cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-brown-950 uppercase">
          ✉ {editing ? "Modifica comunicazione" : "Nuova comunicazione"}
        </summary>
        <Panel className="mt-4">
          <CampaignComposer campaign={editing} sources={sources} confirmedCount={confirmed} />
          {editing && (
            <p className="mt-4 border-t border-brown-900/10 pt-3 text-xs text-brown-800/60">
              Stai modificando una campagna esistente.{" "}
              <Link href="/admin/newsletter" className="font-semibold text-gold-deep underline">
                Componi invece una nuova comunicazione
              </Link>
              .
            </p>
          )}
        </Panel>
      </details>

      {/* Campaign history */}
      {campaigns.length > 0 && (
        <>
          <h2 className="font-display mt-8 mb-3 text-xl text-brown-950">Comunicazioni</h2>
          <div className="mb-8 space-y-3">
            {campaigns.map((c) => (
              <Panel key={c.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-brown-950">
                    {c.subject}
                    <CampaignStatus campaign={c} />
                  </p>
                  <p className="mt-0.5 text-xs text-brown-800/60">
                    {c.segment ? `Segmento ${c.segment}` : "Tutti i confermati"}
                    {c.status === "sent" && ` · ${c.recipientCount} destinatari · ${fmtDateTime(c.sentAt)}`}
                    {c.status === "scheduled" && ` · programmata per ${fmtDateTime(c.scheduledFor)}`}
                    {c.status === "draft" && ` · bozza del ${fmtDate(c.createdAt)}`}
                    {c.error && ` · ${c.error}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {c.status === "sent" ? (
                    <ActionForm action={duplicateCampaign} className="inline-flex">
                      <input type="hidden" name="id" value={c.id} />
                      <PendingButton tone="dark">Duplica</PendingButton>
                    </ActionForm>
                  ) : (
                    <>
                      <Link
                        href={`/admin/newsletter?campagna=${c.id}`}
                        className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                      >
                        Modifica
                      </Link>
                      <DeleteForm
                        action={deleteCampaign}
                        id={c.id}
                        confirm={`Eliminare la comunicazione "${c.subject}"?`}
                      />
                    </>
                  )}
                </div>
              </Panel>
            ))}
          </div>
        </>
      )}

      <FilterChips basePath={BASE} params={linkParams} name="stato" options={STATUS_CHIPS} />
      <FilterChips
        basePath={BASE}
        params={linkParams}
        name="origine"
        options={chipsFrom(sources, "Tutte le origini")}
        className="mb-4"
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[18rem] flex-1">
          <FilterSearch basePath={BASE} params={linkParams} placeholder="Indirizzo email…" />
        </div>
        <DensityToggle basePath={BASE} params={linkParams} density={density} />
      </div>

      <DataTable
        rows={subs}
        rowKey={(s) => s.id}
        basePath={BASE}
        params={linkParams}
        sort={sort}
        density={density}
        empty={
          q || stato !== "all" || origine !== "all"
            ? "Nessun iscritto corrisponde ai filtri."
            : "Nessun iscritto ancora."
        }
        columns={[
          {
            key: "email",
            header: "Email",
            sortable: true,
            cell: (s) => <span className="font-medium text-brown-950">{s.email}</span>,
          },
          {
            key: "stato",
            header: "Stato",
            sortable: true,
            cell: (s) => (
              <StatusBadge
                status={
                  s.status === "confirmed" ? "confirmed" : s.status === "unsubscribed" ? "cancelled" : "pending"
                }
              />
            ),
          },
          {
            key: "origine",
            header: "Origine",
            sortable: true,
            hideOnMobile: true,
            cell: (s) => <span className="text-brown-800/70">{s.source || "—"}</span>,
          },
          {
            key: "iscritto",
            header: "Iscritto",
            sortable: true,
            hideOnMobile: true,
            cell: (s) => <span className="text-brown-800/70">{fmtDate(s.createdAt)}</span>,
          },
          {
            key: "azioni",
            header: <span className="sr-only">Azioni</span>,
            align: "right",
            cell: (s) =>
              s.status !== "unsubscribed" ? (
                <DeleteForm
                  action={removeSubscriber}
                  id={s.id}
                  confirm={`Rimuovere ${s.email} dalla newsletter?`}
                >
                  Rimuovi
                </DeleteForm>
              ) : null,
          },
        ]}
      />

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={linkParams} />
    </div>
  );
}
