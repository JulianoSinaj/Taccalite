import { AdminHeader, Panel, StatusBadge, Pagination, fmtDate } from "@/components/admin/ui";
import { SegmentedFilter, FilterToolbar, ActiveFilters, labelFrom } from "@/components/admin/FilterBar";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getOutboxPage } from "@/lib/admin/queries";
import { outboxFilters } from "@/lib/admin/filters";
import { retryOutboxEmail, retryAllFailed } from "@/lib/admin/outbox-actions";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/mail/mailer";
import { smtpAuthConfigured, smtpConfigured } from "@/lib/env";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const BASE = "/admin/outbox";

/** Readable plain text from an HTML-only body, for the preview box. */
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

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "queued", label: "In coda" },
  { value: "sent", label: "Inviate" },
  { value: "failed", label: "Fallite" },
];

type SP = {
  searchParams: Promise<{ stato?: string; q?: string; page?: string }>;
};

export default async function AdminOutbox({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = outboxFilters(sp);
  // Message bodies are admin-only. Every password-reset and email-verification
  // link the platform has ever sent is stored here verbatim (`sendMail` writes
  // the body before delivering it), so rendering them to staff handed anyone at
  // the counter a way into the owner's account: request a reset for the owner's
  // address, open this page, follow the link. Staff keep the list itself —
  // recipient, subject, status and error are what the retry workflow needs.
  const [{ rows, total, failed, exhausted, pageCount }, admin] = await Promise.all([
    getOutboxPage({ ...filters, page }),
    isAdmin(),
  ]);

  return (
    <div>
      <AdminHeader
        title="Email"
        subtitle={`${total} email registrate dalla piattaforma`}
        action={
          failed > 0 ? (
            <div className="flex flex-wrap gap-2">
              <ActionForm action={retryAllFailed}>
                <PendingButton tone="dark">Riprova tutte le fallite</PendingButton>
              </ActionForm>
              {/* `retryAllFailed` has always accepted this flag; nothing sent
                  it, so after fixing SMTP the only way through a backlog of
                  exhausted messages was to click "Forza reinvio" on each one —
                  which is what the banner below was telling people to do. */}
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
            </div>
          ) : undefined
        }
      />

      {/* Gated on `smtpAuthConfigured`, not `smtpConfigured`. With a host set and
          blank credentials this banner was silent on the one screen whose whole
          job is explaining why nothing arrived — and the failure there is the
          worse of the two: the relay rejects each message and it is retired
          after OUTBOX_MAX_ATTEMPTS, rather than waiting in `queued` for a fix. */}
      {!smtpAuthConfigured &&
        (smtpConfigured ? (
          <div className="mb-6 rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm text-danger-soft-fg">
            Credenziali SMTP mancanti: il server è impostato ma <code>SMTP_USER</code>/
            <code>SMTP_PASS</code> sono vuoti, quindi il relay rifiuta ogni messaggio con{" "}
            <code>502 Please authenticate first</code>. Le email qui sotto risultano{" "}
            <strong>non inviate</strong> e vengono abbandonate dopo {OUTBOX_MAX_ATTEMPTS} tentativi.
            Riprovare non serve finché le credenziali non sono impostate — vedi{" "}
            <strong>Impostazioni</strong>.
          </div>
        ) : (
          <div className="mb-6 rounded-2xl border border-warn/40 bg-warn-soft px-5 py-4 text-sm text-warn-soft-fg">
            SMTP non configurato: le email non vengono inviate ma restano registrate qui (modalità
            test). Configura l&apos;invio reale da <strong>Impostazioni</strong>.
          </div>
        ))}

      {failed > 0 && (
        <div className="mb-6 rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4 text-sm text-danger-soft-fg">
          {failed === 1
            ? "1 email non è stata inviata."
            : `${failed} email non sono state inviate.`}{" "}
          Puoi rimetterle in coda con <strong>Riprova</strong>.
          {exhausted > 0 && (
            <>
              {" "}
              {exhausted === 1 ? "Una di queste ha" : `${exhausted} hanno`} esaurito i tentativi:
              dopo aver corretto la causa usa <strong>Forza tutte</strong> qui sopra.
            </>
          )}
        </div>
      )}

      <SegmentedFilter
        basePath={BASE}
        params={filters}
        name="stato"
        options={FILTERS}
        label="Filtra per stato di invio"
      />
      <FilterToolbar
        basePath={BASE}
        params={filters}
        searchPlaceholder="Destinatario o oggetto…"
        carry={["stato"]}
        formId="outbox-filters"
      />
      <ActiveFilters
        basePath={BASE}
        params={filters}
        labels={{
          stato: { title: "Stato", format: labelFrom(FILTERS) },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      {rows.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna email trovata.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {rows.map((e) => (
            <Panel key={e.id}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                  <StatusBadge status={e.status} />
                  <span className="font-semibold text-brown-950">{e.subject}</span>
                  <span className="text-xs text-brown-800/60">→ {e.toAddress}</span>
                  {e.attempts > 1 && (
                    <span className="text-[11px] font-bold tracking-widest text-brown-800/50 uppercase">
                      {e.attempts} tentativi
                    </span>
                  )}
                  <span className="ml-auto text-xs text-brown-800/50">{fmtDate(e.createdAt)}</span>
                </summary>
                {e.error && <p className="mt-3 text-xs text-danger-soft-fg">Errore: {e.error}</p>}
                {/* Some messages are HTML-only; showing just the text part left
                    an empty box with no hint that anything had been sent. */}
                {!admin ? (
                  <p className="mt-3 rounded-lg bg-cream/60 px-4 py-3 text-xs text-brown-800/70">
                    Il testo del messaggio è visibile solo agli amministratori: queste email
                    contengono i link per reimpostare la password e per confermare gli indirizzi.
                  </p>
                ) : e.text.trim() ? (
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-cream/60 p-4 text-xs text-brown-900">
                    {e.text}
                  </pre>
                ) : (
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-cream/60 p-4 text-[12px] text-brown-800/70">
                    {stripHtml(e.html) || "(nessun contenuto)"}
                  </pre>
                )}
                {e.status === "failed" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {e.attempts < OUTBOX_MAX_ATTEMPTS ? (
                      <ActionForm action={retryOutboxEmail} className="inline-flex">
                        <input type="hidden" name="id" value={e.id} />
                        <PendingButton tone="gold">Riprova</PendingButton>
                      </ActionForm>
                    ) : (
                      <p className="text-xs text-brown-800/70">
                        Tentativi esauriti ({e.attempts}): l&apos;indirizzo è probabilmente sbagliato.
                      </p>
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
                  </div>
                )}
              </details>
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={filters} />
    </div>
  );
}
