import Link from "next/link";
import {
  AdminHeader,
  Panel,
  StatusBadge,
  fmtDate,
  fmtDateTime,
  inputCls,
  labelCls,
  Pagination,
} from "@/components/admin/ui";
import {
  SegmentedFilter,
  FilterToolbar,
  ActiveFilters,
  chipsFrom,
  labelFrom,
} from "@/components/admin/FilterBar";
import { DataTable, DensityToggle, densityFrom } from "@/components/admin/DataTable";
import { ActionForm, PendingButton, DeleteForm } from "@/components/admin/ActionForm";
import { CampaignComposer, type SegmentOption } from "@/components/admin/CampaignComposer";
import { getSubscribersPage, SUBSCRIBER_SORTS } from "@/lib/admin/queries";
import { subscriberFilters, sortFilters, filterQuery } from "@/lib/admin/filters";
import { removeSubscriber } from "@/lib/admin/actions";
import {
  duplicateCampaign,
  deleteCampaign,
  saveSegment,
  deleteSegment,
} from "@/lib/admin/campaign-actions";
import { listCampaigns, getCampaign, campaignDelivery } from "@/lib/newsletter-campaigns";
import { listSegments, countSegment, describeRule } from "@/lib/segments";
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
    scheduled: { label: "Programmata", cls: "bg-warn-soft text-warn-soft-fg" },
    sent: { label: "Inviata", cls: "bg-ok-soft text-ok-soft-fg" },
    failed: { label: "Fallita", cls: "bg-danger-soft text-danger-soft-fg" },
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
  const [{ rows: subs, total, confirmed, pageCount, sources }, admin, campaigns, editing, segmentRows] =
    await Promise.all([
      getSubscribersPage({ ...filters, page, sort }),
      isAdmin(),
      listCampaigns(),
      sp.campagna ? getCampaign(sp.campagna) : Promise.resolve(null),
      listSegments(),
    ]);
  const SOURCE_CHIPS = chipsFrom(sources, "Tutte le origini");

  // Segments carry their live size, so an operator picks an audience knowing how
  // big it is rather than finding out after sending.
  const segments: SegmentOption[] = await Promise.all(
    segmentRows.map(async (s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      rule: describeRule(s.rule),
      size: await countSegment(s.rule),
    })),
  );
  const segmentName = new Map(segments.map((s) => [s.id, s.name]));
  // Delivery outcomes, so "inviata a 412" can't hide 80 bounces.
  const delivery = await campaignDelivery(campaigns.filter((c) => c.status === "sent").map((c) => c.id));

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
        <summary className="w-fit cursor-pointer rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-on-gold uppercase">
          ✉ {editing ? "Modifica comunicazione" : "Nuova comunicazione"}
        </summary>
        <Panel className="mt-4">
          <CampaignComposer
            campaign={editing}
            sources={sources}
            segments={segments}
            confirmedCount={confirmed}
          />
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
                    {c.segmentId
                      ? `Segmento «${segmentName.get(c.segmentId) ?? "eliminato"}»`
                      : c.segment
                        ? `Origine ${c.segment}`
                        : "Tutti i confermati"}
                    {c.status === "sent" && ` · ${c.recipientCount} destinatari · ${fmtDateTime(c.sentAt)}`}
                    {c.status === "scheduled" && ` · programmata per ${fmtDateTime(c.scheduledFor)}`}
                    {c.status === "draft" && ` · bozza del ${fmtDate(c.createdAt)}`}
                    {c.error && ` · ${c.error}`}
                  </p>
                  {/* What actually arrived. recipientCount is how many were
                      enqueued, which is not the same thing. */}
                  {c.status === "sent" &&
                    (() => {
                      const d = delivery.get(c.id);
                      if (!d) return null;
                      return (
                        <p className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold tracking-widest uppercase">
                          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-ok-soft-fg">
                            {d.sent} consegnate
                          </span>
                          {d.queued > 0 && (
                            <span className="rounded-full bg-warn-soft px-2 py-0.5 text-warn-soft-fg">
                              {d.queued} in coda
                            </span>
                          )}
                          {d.failed > 0 && (
                            <Link
                              href="/admin/outbox?stato=failed"
                              className="rounded-full bg-danger-soft px-2 py-0.5 text-danger-soft-fg hover:brightness-95"
                            >
                              {d.failed} non recapitate
                            </Link>
                          )}
                        </p>
                      );
                    })()}
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

      {/* Reusable audiences. "Segments" used to mean the raw signup source,
          which can't express "chi ha speso più di 100 €" or "chi non ordina da
          sei mesi" — most of what a shop wants to say something to. */}
      {admin && (
        <details className="mb-8" open={segments.length === 0}>
          <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
            Segmenti ({segments.length})
          </summary>
          <div className="mt-3 space-y-3">
            {segments.map((s) => (
              <Panel key={s.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-brown-950">
                    {s.name}{" "}
                    {/* A translucent wash, not solid gold — so the ink here is
                        the inverting one, not the constant `on-gold`. */}
                    <span className="ml-1 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-brown-950 uppercase">
                      {s.size} iscritti
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-brown-800/60">{s.description || s.rule}</p>
                </div>
                <DeleteForm
                  action={deleteSegment}
                  id={s.id}
                  confirm={`Eliminare il segmento «${s.name}»? Le campagne che lo usavano torneranno a «tutti gli iscritti».`}
                />
              </Panel>
            ))}

            <Panel>
              <ActionForm action={saveSegment} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelCls} htmlFor="seg-name">
                    Nome
                  </label>
                  <input id="seg-name" name="name" required placeholder="es. Clienti fedeli" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="seg-source">
                    Origine iscrizione
                  </label>
                  <select id="seg-source" name="source" className={inputCls}>
                    <option value="">Qualsiasi</option>
                    {sources.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls} htmlFor="seg-desc">
                    Descrizione
                  </label>
                  <input id="seg-desc" name="description" maxLength={300} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="seg-points">
                    Punti minimi
                  </label>
                  <input id="seg-points" name="minPoints" type="number" min={0} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="seg-orders">
                    Ordini minimi
                  </label>
                  <input id="seg-orders" name="minOrders" type="number" min={0} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="seg-spend">
                    Spesa minima (€)
                  </label>
                  <input id="seg-spend" name="minSpendEuros" type="number" step="0.01" min={0} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="seg-inactive">
                    Inattivi da (giorni)
                  </label>
                  <input id="seg-inactive" name="inactiveDays" type="number" min={1} className={inputCls} />
                </div>
                <div className="flex items-end pb-2.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-brown-900">
                    <input
                      type="checkbox"
                      name="requireMarketingConsent"
                      className="h-4 w-4 rounded accent-brown-950"
                    />
                    Solo con consenso marketing
                  </label>
                </div>
                <div className="flex items-end">
                  <PendingButton tone="dark">Crea segmento</PendingButton>
                </div>
              </ActionForm>
              <p className="mt-3 text-xs text-brown-800/60">
                Un segmento salva la <strong>regola</strong>, non l&apos;elenco: viene ricalcolato a ogni
                invio, quindi «clienti fedeli» significa la stessa cosa a marzo e a gennaio. Vale solo
                sugli iscritti confermati alla newsletter.
              </p>
            </Panel>
          </div>
        </details>
      )}

      <SegmentedFilter
        basePath={BASE}
        params={linkParams}
        name="stato"
        options={STATUS_CHIPS}
        label="Filtra per stato iscrizione"
      />
      <FilterToolbar
        basePath={BASE}
        params={linkParams}
        searchPlaceholder="Indirizzo email…"
        carry={["stato", "densita"]}
        formId="newsletter-filters"
        facets={[{ name: "origine", label: "Origine", options: SOURCE_CHIPS }]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ActiveFilters
          basePath={BASE}
          params={linkParams}
          labels={{
            stato: { title: "Stato", format: labelFrom(STATUS_CHIPS) },
            origine: { title: "Origine" },
            q: { title: "Ricerca", format: (v) => `“${v}”` },
          }}
        />
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
