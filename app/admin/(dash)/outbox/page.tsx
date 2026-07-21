import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, SearchBox, Pagination, fmtDate } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getOutboxPage } from "@/lib/admin/queries";
import { retryOutboxEmail, retryAllFailed } from "@/lib/admin/outbox-actions";
import { smtpConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

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
  const { stato = "all", q = "", page: pageStr } = await searchParams;
  const page = Number(pageStr) || 1;
  const { rows, total, failed, pageCount } = await getOutboxPage({ page, status: stato, q: q || undefined });

  const current = { stato, q };
  const filterHref = (next: Partial<typeof current>) => {
    const merged = { ...current, ...next };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/admin/outbox?${qs}` : "/admin/outbox";
  };

  return (
    <div>
      <AdminHeader
        title="Email"
        subtitle={`${total} email registrate dalla piattaforma`}
        action={
          failed > 0 ? (
            <ActionForm action={retryAllFailed}>
              <PendingButton tone="dark">Riprova tutte le fallite</PendingButton>
            </ActionForm>
          ) : undefined
        }
      />

      {!smtpConfigured && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          SMTP non configurato: le email non vengono inviate ma restano registrate qui (modalità
          test). Configura l&apos;invio reale da <strong>Impostazioni</strong>.
        </div>
      )}

      {failed > 0 && (
        <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-900">
          {failed === 1
            ? "1 email non è stata inviata."
            : `${failed} email non sono state inviate.`}{" "}
          Puoi rimetterle in coda con <strong>Riprova</strong>.
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={filterHref({ stato: f.value })}
            className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              stato === f.value ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <SearchBox
        basePath="/admin/outbox"
        q={q}
        placeholder="Cerca per destinatario o oggetto…"
        hidden={stato !== "all" ? { stato } : {}}
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
                  <span className="ml-auto text-xs text-brown-800/50">{fmtDate(e.createdAt)}</span>
                </summary>
                {e.error && <p className="mt-3 text-xs text-red-700">Errore: {e.error}</p>}
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-cream/60 p-4 text-xs text-brown-900">
                  {e.text}
                </pre>
                {e.status === "failed" && (
                  <div className="mt-3">
                    <ActionForm action={retryOutboxEmail}>
                      <input type="hidden" name="id" value={e.id} />
                      <PendingButton tone="gold">Riprova</PendingButton>
                    </ActionForm>
                  </div>
                )}
              </details>
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath="/admin/outbox" page={page} pageCount={pageCount} params={{ stato: stato !== "all" ? stato : undefined, q: q || undefined }} />
    </div>
  );
}
