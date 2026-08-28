import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown } from "lucide-react";
import {
  AdminHeader,
  Panel,
  StatusBadge,
  TableSkeleton,
  Pagination,
  fmtDateTime,
  inputCls,
  labelCls,
} from "@/components/admin/ui";
import { SegmentedFilter, FilterToolbar, ActiveFilters, labelFrom } from "@/components/admin/FilterBar";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getOutboxPage, getOutboxSummary, getCampaignSubject } from "@/lib/admin/queries";
import { TotalSubtitle } from "@/components/admin/Streamed";
import { outboxFilters, filterQuery, type OutboxFilters } from "@/lib/admin/filters";
import { retryOutboxEmail, retryAllFailed, deleteOutboxEmail } from "@/lib/admin/outbox-actions";
import { OUTBOX_MAX_ATTEMPTS, OUTBOX_RETENTION_DAYS } from "@/lib/mail/mailer";
import { smtpAuthConfigured, smtpConfigured } from "@/lib/env";
import { isAdmin } from "@/lib/auth/session";
import type { EmailOutboxRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const BASE = "/admin/outbox";

const STATUS_FILTERS: { value: "all" | "queued" | "sent" | "failed"; label: string }[] = [
  { value: "all", label: "Tutte" },
  { value: "queued", label: "In coda" },
  { value: "sent", label: "Inviate" },
  { value: "failed", label: "Fallite" },
];

const exportBtnCls =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15";

type SP = {
  searchParams: Promise<{
    stato?: string;
    q?: string;
    id?: string;
    campaign?: string;
    da?: string;
    a?: string;
    page?: string;
  }>;
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminOutbox({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = outboxFilters(sp);
  const filtered =
    filters.stato !== "all" || !!filters.q || !!filters.id || !!filters.campaign || !!filters.da || !!filters.a;

  // Message bodies are admin-only. Every password-reset and email-verification
  // link the platform has ever sent is stored here verbatim, so rendering them
  // to staff would hand anyone at the counter a way into the owner's account.
  // Staff keep the list itself — recipient, subject, status and error are what
  // the retry workflow needs.
  // Started, not awaited: the banner, the retry buttons and the status chips are
  // whole-outbox figures and must not wait on a page of messages.
  const promise = getOutboxPage({ ...filters, page });
  const [{ failed, exhausted, counts }, admin, filteredCampaign] = await Promise.all([
    getOutboxSummary(filters),
    isAdmin(),
    filters.campaign ? getCampaignSubject(filters.campaign) : Promise.resolve(null),
  ]);

  return (
    <div>
      <AdminHeader
        title="Email"
        subtitle={
          <TotalSubtitle promise={promise} one="email" many="email" suffix=" registrate dalla piattaforma" />
        }
        action={
          <div className="flex flex-wrap gap-2">
            {failed > 0 && (
              <ActionForm action={retryAllFailed}>
                <PendingButton tone="dark">Riprova tutte le fallite</PendingButton>
              </ActionForm>
            )}
            {exhausted > 0 && (
              <ActionForm action={retryAllFailed}>
                <input type="hidden" name="azzera" value="true" />
                <PendingButton
                  tone="gold"
                  confirm={`Azzerare il contatore di ${exhausted} email e riprovare tutte? Fallo solo dopo aver corretto la causa (SMTP, indirizzo, DNS).`}
                >
                  Forza tutte ({exhausted})
                </PendingButton>
              </ActionForm>
            )}
            <Link href="/admin/settings#smtp" className={exportBtnCls} title="Stato SMTP e invio di un'email di prova">
              Email di prova
            </Link>
            {/* Gated on the whole-outbox count rather than the filtered one: the
                export applies the current filters, and a filter that matches
                nothing is exactly when an operator wants to widen it, not to
                lose the button. */}
            {admin && counts.all > 0 && (
              <a
                href={`/api/admin/export/email${filterQuery(filters)}`}
                download
                className={exportBtnCls}
                title="Le email elencate con i filtri attuali (senza il testo dei messaggi)"
              >
                Esporta CSV
              </a>
            )}
          </div>
        }
      />

      <SmtpBanner />
      {failed > 0 && <FailedBanner failed={failed} exhausted={exhausted} />}

      <SegmentedFilter
        basePath={BASE}
        params={filters}
        name="stato"
        options={STATUS_FILTERS.map((o) => ({ value: o.value, label: `${o.label} (${counts[o.value]})` }))}
        label="Filtra per stato di invio"
      />
      <FilterToolbar
        basePath={BASE}
        params={filters}
        searchPlaceholder="Destinatario o oggetto…"
        carry={["stato", "campaign"]}
        formId="outbox-filters"
      >
        <div>
          <label className={labelCls} htmlFor="outbox-filters-da">
            Dal
          </label>
          <input id="outbox-filters-da" type="date" name="da" defaultValue={filters.da ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="outbox-filters-a">
            Al
          </label>
          <input id="outbox-filters-a" type="date" name="a" defaultValue={filters.a ?? ""} className={inputCls} />
        </div>
      </FilterToolbar>
      <ActiveFilters
        basePath={BASE}
        params={filters}
        labels={{
          stato: { title: "Stato", format: labelFrom(STATUS_FILTERS) },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
          id: { title: "Email", format: (v) => v.slice(0, 8) },
          campaign: { title: "Campagna", format: (v) => filteredCampaign ?? v.slice(0, 8) },
          da: { title: "Dal" },
          a: { title: "Al" },
        }}
      />

      {/* Only the messages wait on the query. */}
      <Suspense key={filterQuery({ ...filters, page: String(page) })} fallback={<TableSkeleton rows={6} />}>
        <OutboxList promise={promise} filters={filters} filtered={filtered} admin={admin} page={page} />
      </Suspense>
    </div>
  );
}

async function OutboxList({
  promise,
  filters,
  filtered,
  admin,
  page,
}: {
  promise: ReturnType<typeof getOutboxPage>;
  filters: OutboxFilters;
  filtered: boolean;
  admin: boolean;
  page: number;
}) {
  const { rows, campaigns, pageCount } = await promise;
  return (
    <>
      {rows.length === 0 ? (
        <EmptyState filters={filters} filtered={filtered} />
      ) : (
        <div className="space-y-3">
          {rows.map((e) => (
            <OutboxRow
              key={e.id}
              email={e}
              campaignSubject={e.campaignId ? campaigns[e.campaignId] : undefined}
              admin={admin}
              open={e.id === filters.id}
            />
          ))}
        </div>
      )}

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={filters} />
    </>
  );
}

// ── Banners ──────────────────────────────────────────────────────────────────

/**
 * Gated on `smtpAuthConfigured`, not `smtpConfigured`: a host with blank
 * credentials is the worse failure (the relay rejects each message and it is
 * retired after OUTBOX_MAX_ATTEMPTS) rather than the lesser one.
 */
function SmtpBanner() {
  if (smtpAuthConfigured) return null;
  return smtpConfigured ? (
    <div className="mb-6 rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm text-danger-soft-fg">
      Credenziali SMTP mancanti: il server è impostato ma <code>SMTP_USER</code>/<code>SMTP_PASS</code> sono
      vuoti, quindi il relay rifiuta ogni messaggio con <code>502 Please authenticate first</code>. Le email qui
      sotto risultano <strong>non inviate</strong> e vengono abbandonate dopo {OUTBOX_MAX_ATTEMPTS} tentativi.
      Riprovare non serve finché le credenziali non sono impostate — vedi{" "}
      <Link href="/admin/settings#smtp" className="font-semibold underline">
        Impostazioni
      </Link>
      .
    </div>
  ) : (
    <div className="mb-6 rounded-2xl border border-warn/40 bg-warn-soft px-5 py-4 text-sm text-warn-soft-fg">
      SMTP non configurato: le email non vengono inviate ma restano registrate qui (modalità test). Configura
      l&apos;invio reale da{" "}
      <Link href="/admin/settings#smtp" className="font-semibold underline">
        Impostazioni
      </Link>
      .
    </div>
  );
}

function FailedBanner({ failed, exhausted }: { failed: number; exhausted: number }) {
  return (
    <div className="mb-6 rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm text-danger-soft-fg">
      {failed === 1 ? "1 email non è stata inviata." : `${failed} email non sono state inviate.`} Puoi rimetterle in
      coda con <strong>Riprova</strong>.
      {exhausted > 0 && (
        <>
          {" "}
          {exhausted === 1 ? "Una di queste ha" : `${exhausted} hanno`} esaurito i tentativi: dopo aver corretto la
          causa usa <strong>Forza tutte</strong> qui sopra.
        </>
      )}
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filters, filtered }: { filters: OutboxFilters; filtered: boolean }) {
  return (
    <Panel>
      <p className="text-brown-800/70">
        {filters.id
          ? `Email non trovata: potrebbe essere stata eliminata, oppure rimossa dalla pulizia automatica (le inviate restano ${OUTBOX_RETENTION_DAYS} giorni).`
          : filtered
            ? "Nessuna email corrisponde ai filtri."
            : "Nessuna email ancora. Conferme d'ordine, prenotazioni e notifiche compaiono qui appena la piattaforma le genera."}
      </p>
      {filtered && (
        <Link href={BASE} className="mt-3 inline-block text-sm font-semibold text-gold-deep underline">
          Mostra tutte
        </Link>
      )}
    </Panel>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

/** Readable plain text from an HTML-only body, for the fallback preview. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function OutboxRow({
  email: e,
  campaignSubject,
  admin,
  open,
}: {
  email: EmailOutboxRow;
  campaignSubject?: string;
  admin: boolean;
  open: boolean;
}) {
  const exhausted = e.attempts >= OUTBOX_MAX_ATTEMPTS;
  return (
    <Panel>
      <details className="group" open={open || undefined}>
        {/* `list-none` plus the explicit chevron: a flex summary loses the native
            disclosure marker, which left rows looking like static cards. */}
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 [&::-webkit-details-marker]:hidden">
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-brown-800/70 transition-transform group-open:rotate-180"
          />
          <StatusBadge status={e.status} />
          <span className="font-semibold text-brown-950">{e.subject}</span>
          <span className="text-xs text-brown-800/70">→ {e.toAddress}</span>
          {e.campaignId && (
            <span className="rounded-full bg-brown-900/8 px-2 py-0.5 text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">
              Newsletter
            </span>
          )}
          {e.attempts > 1 && (
            <span className="text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">
              {e.attempts} tentativi
            </span>
          )}
          <span className="ml-auto text-xs text-brown-800/70">{fmtDateTime(e.createdAt)}</span>
        </summary>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
          <Meta label="Creata">{fmtDateTime(e.createdAt)}</Meta>
          <Meta label="Inviata">{e.sentAt ? fmtDateTime(e.sentAt) : "—"}</Meta>
          <Meta label="Tentativi">
            {e.attempts} / {OUTBOX_MAX_ATTEMPTS}
          </Meta>
          {e.campaignId ? (
            <Meta label="Campagna">
              <Link href={`${BASE}?campaign=${e.campaignId}`} className="underline">
                {campaignSubject ?? "Campagna eliminata"}
              </Link>
            </Meta>
          ) : (
            <Meta label="ID">
              <span className="font-mono">{e.id.slice(0, 8)}</span>
            </Meta>
          )}
        </dl>

        {e.error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-4 py-2 text-xs text-danger-soft-fg">Errore: {e.error}</p>
        )}

        <Body email={e} admin={admin} />

        {(e.status === "failed" || (admin && e.status === "queued")) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {e.status === "failed" && (
              <>
                {exhausted ? (
                  <p className="text-xs text-brown-800/70">
                    Tentativi esauriti: l&apos;indirizzo è probabilmente sbagliato.
                  </p>
                ) : (
                  <ActionForm action={retryOutboxEmail} className="inline-flex">
                    <input type="hidden" name="id" value={e.id} />
                    <PendingButton tone="gold">Riprova</PendingButton>
                  </ActionForm>
                )}
                <ActionForm action={retryOutboxEmail} className="inline-flex">
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="azzera" value="true" />
                  <PendingButton
                    tone="dark"
                    confirm="Azzerare il contatore e riprovare? Fallo solo se hai corretto la causa dell'errore."
                  >
                    Forza reinvio
                  </PendingButton>
                </ActionForm>
              </>
            )}
            {admin && (
              <ActionForm action={deleteOutboxEmail} className="inline-flex sm:ml-auto">
                <input type="hidden" name="id" value={e.id} />
                <PendingButton
                  tone="danger"
                  confirm={
                    e.status === "queued"
                      ? "Eliminare questa email? Non verrà inviata."
                      : "Eliminare questa email fallita? Non potrà più essere riprovata."
                  }
                >
                  Elimina
                </PendingButton>
              </ActionForm>
            )}
          </div>
        )}
      </details>
    </Panel>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold tracking-widest text-brown-800/70 uppercase">{label}</dt>
      <dd className="mt-0.5 text-brown-900">{children}</dd>
    </div>
  );
}

/**
 * What the customer received. The HTML part is rendered in a sandboxed iframe
 * (no scripts, no same-origin access) so a template bug shows up as it would in
 * a mail client; the plain-text part is kept underneath for messages that have
 * one, and used alone for text-only mail.
 */
function Body({ email: e, admin }: { email: EmailOutboxRow; admin: boolean }) {
  if (!admin) {
    return (
      <p className="mt-3 rounded-lg bg-cream/60 px-4 py-3 text-xs text-brown-800/70">
        Il testo del messaggio è visibile solo agli amministratori: queste email contengono i link per reimpostare
        la password e per confermare gli indirizzi.
      </p>
    );
  }
  const html = e.html.trim();
  const text = e.text.trim();
  if (!html && !text) {
    return <p className="mt-3 text-xs text-brown-800/70">(nessun contenuto)</p>;
  }
  if (!html) {
    return (
      <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-cream/60 p-4 text-xs whitespace-pre-wrap text-brown-900">
        {text}
      </pre>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <iframe
        title={`Anteprima: ${e.subject}`}
        srcDoc={html}
        sandbox=""
        className="h-80 w-full rounded-lg border border-brown-900/10 bg-surface"
      />
      <details>
        <summary className="w-fit cursor-pointer text-[11px] font-bold tracking-widest text-brown-800/70 uppercase hover:text-brown-950">
          Versione testo
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-cream/60 p-4 text-xs whitespace-pre-wrap text-brown-900">
          {text || stripHtml(html)}
        </pre>
      </details>
    </div>
  );
}
