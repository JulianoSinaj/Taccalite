import Link from "next/link";
import { redirect } from "next/navigation";
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
} from "@/components/admin/FilterBar";
import { DataTable } from "@/components/admin/DataTable";
import { ActionForm, PendingButton, DeleteForm } from "@/components/admin/ActionForm";
import { CampaignComposer, type SegmentOption } from "@/components/admin/CampaignComposer";
import { getSubscribersPage, adminGetShops, SUBSCRIBER_SORTS } from "@/lib/admin/queries";
import { subscriberFilters, sortFilters, filterQuery } from "@/lib/admin/filters";
import {
  removeSubscriber,
  addSubscriber,
  resendSubscriberConfirmation,
  confirmSubscriber,
} from "@/lib/admin/actions";
import {
  duplicateCampaign,
  deleteCampaign,
  sendCampaignNow,
  saveSegment,
  deleteSegment,
} from "@/lib/admin/campaign-actions";
import { listCampaigns, getCampaign, campaignDelivery } from "@/lib/newsletter-campaigns";
import { listSegments, countSegment, describeRule } from "@/lib/segments";
import { newsletterBroadcast } from "@/lib/mail/templates";
import { isAdmin } from "@/lib/auth/session";
import type { CustomerSegmentRow, NewsletterCampaignRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const BASE = "/admin/newsletter";
/** Campaigns shown by default; `?campagne=tutte` lifts the cap. */
const RECENT_CAMPAIGNS = 10;
const ALL_CAMPAIGNS = 500;

type SP = {
  searchParams: Promise<{
    page?: string;
    stato?: string;
    origine?: string;
    q?: string;
    campagna?: string;
    campagne?: string;
    colonna?: string;
    verso?: string;
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
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-widest uppercase ${s.cls}`}>
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

const btnSoft =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";
const disclosureCls =
  "w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950";

/**
 * The create/edit form for one segment. Same fields either way — a new segment
 * is just one with no id — because `saveSegment` already takes both paths.
 */
function SegmentForm({
  segment,
  sources,
  shops,
}: {
  segment?: CustomerSegmentRow;
  sources: string[];
  shops: { slug: string; name: string }[];
}) {
  const rule = segment?.rule ?? {};
  // Field ids have to stay unique: several of these forms render on one page.
  const uid = segment?.id ?? "new";
  const num = (v: number | null | undefined) => (v == null ? "" : String(v));

  return (
    <ActionForm action={saveSegment} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {segment && <input type="hidden" name="id" value={segment.id} />}
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={`seg-name-${uid}`}>
          Nome
        </label>
        <input
          id={`seg-name-${uid}`}
          name="name"
          required
          maxLength={120}
          defaultValue={segment?.name ?? ""}
          placeholder="es. Clienti fedeli"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`seg-source-${uid}`}>
          Origine iscrizione
        </label>
        <select
          id={`seg-source-${uid}`}
          name="source"
          defaultValue={rule.source ?? ""}
          className={inputCls}
        >
          <option value="">Qualsiasi</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-3">
        <label className={labelCls} htmlFor={`seg-desc-${uid}`}>
          Descrizione
        </label>
        <input
          id={`seg-desc-${uid}`}
          name="description"
          maxLength={300}
          defaultValue={segment?.description ?? ""}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`seg-points-${uid}`}>
          Punti minimi
        </label>
        <input
          id={`seg-points-${uid}`}
          name="minPoints"
          type="number"
          min={0}
          defaultValue={num(rule.minPoints)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`seg-orders-${uid}`}>
          Ordini minimi
        </label>
        <input
          id={`seg-orders-${uid}`}
          name="minOrders"
          type="number"
          min={0}
          defaultValue={num(rule.minOrders)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`seg-spend-${uid}`}>
          Spesa minima (€)
        </label>
        <input
          id={`seg-spend-${uid}`}
          name="minSpendEuros"
          type="number"
          step="0.01"
          min={0}
          defaultValue={rule.minSpendCents == null ? "" : (rule.minSpendCents / 100).toFixed(2)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`seg-inactive-${uid}`}>
          Inattivi da (giorni)
        </label>
        <input
          id={`seg-inactive-${uid}`}
          name="inactiveDays"
          type="number"
          min={1}
          defaultValue={num(rule.inactiveDays)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`seg-shop-${uid}`}>
          Ha ordinato dalla sede
        </label>
        <select
          id={`seg-shop-${uid}`}
          name="shopSlug"
          defaultValue={rule.shopSlug ?? ""}
          className={inputCls}
        >
          <option value="">Qualsiasi sede</option>
          {shops.map((sh) => (
            <option key={sh.slug} value={sh.slug}>
              {sh.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end pb-2.5">
        <label className="flex items-center gap-2 text-sm font-medium text-brown-900">
          <input
            type="checkbox"
            name="requireMarketingConsent"
            defaultChecked={!!rule.requireMarketingConsent}
            className="h-4 w-4 rounded accent-brown-950"
          />
          Solo con consenso marketing
        </label>
      </div>
      <div className="flex items-end sm:col-span-3">
        <PendingButton tone="dark">{segment ? "Salva segmento" : "Crea segmento"}</PendingButton>
      </div>
    </ActionForm>
  );
}

export default async function AdminNewsletter({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const { stato = "all", origine = "all", q } = sp;
  const showAllCampaigns = sp.campagne === "tutte";
  const filters = subscriberFilters(sp);
  const sort = sortFilters(sp, SUBSCRIBER_SORTS, { colonna: "iscritto", verso: "desc" });
  // Carried on every sort/page link so the view survives navigation.
  const linkParams = { ...filters, colonna: sort.colonna, verso: sort.verso };
  const [
    { rows: subs, total, confirmed, pageCount, sources },
    admin,
    campaigns,
    editing,
    segmentRows,
    shops,
  ] = await Promise.all([
    getSubscribersPage({ ...filters, page, sort }),
    isAdmin(),
    listCampaigns(showAllCampaigns ? ALL_CAMPAIGNS : RECENT_CAMPAIGNS + 1),
    sp.campagna ? getCampaign(sp.campagna) : Promise.resolve(null),
    listSegments(),
    adminGetShops(),
  ]);

  // A sent campaign is history: the composer would only fail on save. Land on
  // the list, where "Duplica" is the way to send it again.
  if (sp.campagna && (!editing || editing.status === "sent")) redirect(BASE);

  const hasMoreCampaigns = !showAllCampaigns && campaigns.length > RECENT_CAMPAIGNS;
  const visibleCampaigns = hasMoreCampaigns ? campaigns.slice(0, RECENT_CAMPAIGNS) : campaigns;
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
  const segmentSize = new Map(segments.map((s) => [s.id, s.size]));
  // Delivery outcomes, so "inviata a 412" can't hide 80 bounces.
  const delivery = await campaignDelivery(
    visibleCampaigns.filter((c) => c.status === "sent").map((c) => c.id),
  );
  // The real email frame, for the composer's preview: subject and body are
  // filled in client-side as the operator types.
  const templateHtml = newsletterBroadcast("{{SUBJECT}}", "{{BODY}}", "#").html;

  const audienceOf = (c: NewsletterCampaignRow) =>
    c.segmentId
      ? `Segmento «${segmentName.get(c.segmentId) ?? "eliminato"}»`
      : c.segment
        ? `Origine ${c.segment}`
        : "Tutti i confermati";

  return (
    <div>
      <AdminHeader
        title="Newsletter"
        subtitle={`${confirmed} iscritti confermati · ${total} nel filtro attuale`}
        action={
          admin ? (
            <a href={`/api/admin/export/subscribers${filterQuery(filters)}`} download className={btnSoft}>
              Esporta CSV
            </a>
          ) : null
        }
      />

      {/* ── 1. Comunicazioni: composer + history ─────────────────────────────
          Admin-only, like the subscriber export beside it: writing to the whole
          mailing list in the shop's name is the least reversible thing on this
          page, and `campaign-actions` refuses staff server-side. */}
      {admin && (
        <section className="mb-10" aria-labelledby="campaigns-title">
          <h2 id="campaigns-title" className="font-display mb-3 text-xl text-brown-950">
            Comunicazioni
          </h2>

          <details className="mb-4" open={!!editing || campaigns.length === 0}>
            <summary className="w-fit cursor-pointer inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-5 py-2.5 text-xs font-bold tracking-widest text-on-gold uppercase">
              ✉ {editing ? "Modifica comunicazione" : "Nuova comunicazione"}
            </summary>
            <Panel className="mt-4">
              <CampaignComposer
                key={editing?.id ?? "new"}
                campaign={editing}
                segments={segments}
                confirmedCount={confirmed}
                templateHtml={templateHtml}
              />
              {editing && (
                <p className="mt-4 border-t border-brown-900/10 pt-3 text-xs text-brown-800/60">
                  Stai modificando «{editing.subject}».{" "}
                  <Link href={BASE} className="font-semibold text-gold-deep underline">
                    Componi invece una nuova comunicazione
                  </Link>
                  .
                </p>
              )}
            </Panel>
          </details>

          {campaigns.length > 0 && (
            <div className="space-y-3">
              {visibleCampaigns.map((c) => {
                const d = c.status === "sent" ? delivery.get(c.id) : undefined;
                const isEditing = editing?.id === c.id;
                return (
                  <Panel
                    key={c.id}
                    className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
                      isEditing ? "ring-2 ring-gold/60" : ""
                    }`}
                  >
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-brown-950">
                        {c.subject}
                        <CampaignStatus campaign={c} />
                      </p>
                      <p className="mt-0.5 text-xs text-brown-800/60">
                        {audienceOf(c)}
                        {c.status === "sent" && ` · ${c.recipientCount} destinatari · ${fmtDateTime(c.sentAt)}`}
                        {c.status === "scheduled" && ` · programmata per ${fmtDateTime(c.scheduledFor)}`}
                        {c.status === "draft" && ` · bozza del ${fmtDate(c.createdAt)}`}
                        {c.status === "failed" && ` · invio non riuscito${c.error ? `: ${c.error}` : ""}`}
                      </p>
                      {/* What actually arrived. recipientCount is how many were
                          enqueued, which is not the same thing. */}
                      {d && (
                        <p className="mt-1 flex flex-wrap gap-2 text-[12px] font-bold tracking-widest uppercase">
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
                              href={`/admin/outbox?campaign=${c.id}&stato=failed`}
                              className="rounded-full bg-danger-soft px-2 py-0.5 text-danger-soft-fg hover:brightness-95"
                            >
                              {d.failed} non recapitate
                            </Link>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.status === "sent" ? (
                        <ActionForm action={duplicateCampaign} className="inline-flex">
                          <input type="hidden" name="id" value={c.id} />
                          <PendingButton tone="dark">Duplica</PendingButton>
                        </ActionForm>
                      ) : (
                        <>
                          {c.status === "failed" && (
                            <ActionForm action={sendCampaignNow} className="inline-flex">
                              <input type="hidden" name="id" value={c.id} />
                              <PendingButton confirm={`Riprovare l'invio di "${c.subject}" adesso?`}>
                                Riprova
                              </PendingButton>
                            </ActionForm>
                          )}
                          {!isEditing && (
                            <Link href={`${BASE}?campagna=${c.id}`} className={btnSoft}>
                              Modifica
                            </Link>
                          )}
                          <DeleteForm
                            action={deleteCampaign}
                            id={c.id}
                            confirm={`Eliminare la comunicazione "${c.subject}"?${
                              c.status === "scheduled" ? " È programmata: non partirà più." : ""
                            }`}
                          />
                        </>
                      )}
                    </div>
                  </Panel>
                );
              })}
              {hasMoreCampaigns && (
                <p className="text-xs text-brown-800/60">
                  Mostrate le ultime {RECENT_CAMPAIGNS}.{" "}
                  <Link href={`${BASE}?campagne=tutte`} className="font-semibold text-gold-deep underline">
                    Mostra tutte le comunicazioni
                  </Link>
                </p>
              )}
              {showAllCampaigns && (
                <p className="text-xs text-brown-800/60">
                  <Link href={BASE} className="font-semibold text-gold-deep underline">
                    Mostra solo le ultime {RECENT_CAMPAIGNS}
                  </Link>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── 2. Segmenti: reusable audiences ────────────────────────────────── */}
      {admin && (
        <section className="mb-10" aria-labelledby="segments-title">
          <details open={segments.length === 0}>
            <summary className="w-fit cursor-pointer">
              <h2 id="segments-title" className="font-display inline text-xl text-brown-950">
                Segmenti{" "}
                <span className="text-sm font-normal text-brown-800/60">({segments.length})</span>
              </h2>
            </summary>
            <div className="mt-3 space-y-3">
              {segmentRows.map((s) => (
                <Panel key={s.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-brown-950">
                        {s.name}{" "}
                        <span className="ml-1 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-bold text-brown-950 uppercase">
                          {segmentSize.get(s.id) ?? 0} iscritti
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-brown-800/60">
                        {s.description || describeRule(s.rule)}
                      </p>
                    </div>
                    <DeleteForm
                      action={deleteSegment}
                      id={s.id}
                      confirm={`Eliminare il segmento «${s.name}»? Le campagne che lo usavano torneranno a «tutti gli iscritti».`}
                    />
                  </div>
                  <details className="mt-3 border-t border-brown-900/10 pt-3">
                    <summary className={disclosureCls}>Modifica</summary>
                    <div className="mt-3">
                      <SegmentForm segment={s} sources={sources} shops={shops} />
                    </div>
                  </details>
                </Panel>
              ))}

              <Panel>
                <h3 className="font-display mb-3 text-lg text-brown-950">Nuovo segmento</h3>
                <SegmentForm sources={sources} shops={shops} />
                <p className="mt-3 text-xs text-brown-800/60">
                  Un segmento salva la <strong>regola</strong>, non l&apos;elenco: viene ricalcolato a ogni
                  invio, quindi «clienti fedeli» significa la stessa cosa a marzo e a gennaio. Vale solo
                  sugli iscritti confermati alla newsletter.
                </p>
              </Panel>
            </div>
          </details>
        </section>
      )}

      {/* ── 3. Iscritti ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="subscribers-title">
        <h2 id="subscribers-title" className="font-display mb-3 text-xl text-brown-950">
          Iscritti
        </h2>

        {/* Behind a disclosure because adding by hand is an occasional act. */}
        {admin && (
          <details className="mb-4">
            <summary className={disclosureCls}>+ Aggiungi un iscritto</summary>
            <Panel className="mt-3">
              <ActionForm action={addSubscriber} className="flex flex-wrap items-end gap-3">
                <div className="min-w-[16rem] flex-1">
                  <label className={labelCls} htmlFor="new-subscriber">
                    Email
                  </label>
                  <input
                    id="new-subscriber"
                    name="email"
                    type="email"
                    required
                    placeholder="nome@esempio.it"
                    className={inputCls}
                  />
                </div>
                <div className="w-40">
                  <label className={labelCls} htmlFor="new-subscriber-source">
                    Origine
                  </label>
                  <input
                    id="new-subscriber-source"
                    name="source"
                    defaultValue="banco"
                    maxLength={60}
                    list="subscriber-sources"
                    className={inputCls}
                  />
                  <datalist id="subscriber-sources">
                    {sources.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <label className="flex items-center gap-2 pb-2.5 text-xs font-medium text-brown-900">
                  <input type="hidden" name="consensoRaccolto" value="false" />
                  <input
                    type="checkbox"
                    name="consensoRaccolto"
                    value="true"
                    className="h-4 w-4 rounded accent-brown-950"
                  />
                  Consenso già raccolto (modulo cartaceo)
                </label>
                <PendingButton tone="dark">Aggiungi</PendingButton>
              </ActionForm>
              <p className="mt-3 text-xs text-brown-800/60">
                Senza la spunta parte la <strong>conferma via email</strong>, esattamente come
                dall&apos;iscrizione sul sito: l&apos;indirizzo resta «in attesa» finché il cliente non
                clicca. Spunta la casella solo se hai un consenso scritto — la scelta finisce nel
                registro attività, ed è quella la prova che il negozio lo aveva.
              </p>
            </Panel>
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
          carry={["stato"]}
          formId="newsletter-filters"
          facets={[{ name: "origine", label: "Origine", options: SOURCE_CHIPS }]}
        />

        {/* `stato` is already visible in the segmented control above, so only
            the filters without their own control get a removable chip. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <ActiveFilters
            basePath={BASE}
            params={linkParams}
            labels={{
              origine: { title: "Origine" },
              q: { title: "Ricerca", format: (v) => `“${v}”` },
            }}
          />
        </div>

        <DataTable
          rows={subs}
          rowKey={(s) => s.id}
          basePath={BASE}
          params={linkParams}
          sort={sort}
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
              sticky: true,
              cell: (s) => <span className="font-medium text-brown-950">{s.email}</span>,
            },
            {
              key: "stato",
              header: "Stato",
              sortable: true,
              cell: (s) => (
                <div>
                  <StatusBadge
                    status={
                      s.status === "confirmed" ? "confirmed" : s.status === "unsubscribed" ? "cancelled" : "pending"
                    }
                  />
                  {s.status === "unsubscribed" && s.unsubscribedAt && (
                    <p className="mt-1 text-[11px] text-brown-800/60">dal {fmtDate(s.unsubscribedAt)}</p>
                  )}
                </div>
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
              key: "confermato",
              header: "Confermato",
              sortable: true,
              hideOnMobile: true,
              cell: (s) => (
                <span className="text-brown-800/70">{s.confirmedAt ? fmtDate(s.confirmedAt) : "—"}</span>
              ),
            },
            {
              key: "azioni",
              header: <span className="sr-only">Azioni</span>,
              align: "right",
              // Same gate as "Aggiungi" above: managing the list is an admin act.
              cell: (s) =>
                admin && s.status !== "unsubscribed" ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {s.status === "pending" && (
                      <>
                        <ActionForm action={resendSubscriberConfirmation} className="inline-flex">
                          <input type="hidden" name="id" value={s.id} />
                          <PendingButton tone="dark">Reinvia conferma</PendingButton>
                        </ActionForm>
                        <ActionForm action={confirmSubscriber} className="inline-flex">
                          <input type="hidden" name="id" value={s.id} />
                          <PendingButton
                            tone="gold"
                            confirm={`Confermare ${s.email} a mano? Fallo solo se hai il consenso scritto: la scelta resta nel registro attività.`}
                          >
                            Conferma
                          </PendingButton>
                        </ActionForm>
                      </>
                    )}
                    <DeleteForm
                      action={removeSubscriber}
                      id={s.id}
                      confirm={`Rimuovere ${s.email} dalla newsletter?`}
                    >
                      Rimuovi
                    </DeleteForm>
                  </div>
                ) : null,
            },
          ]}
        />

        <Pagination basePath={BASE} page={page} pageCount={pageCount} params={linkParams} />
      </section>
    </div>
  );
}
