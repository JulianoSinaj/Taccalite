import { AdminHeader, Panel, StatusBadge, fmtDate } from "@/components/admin/ui";
import { getOutbox } from "@/lib/admin/queries";
import { smtpConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function AdminOutbox() {
  const emails = await getOutbox();

  return (
    <div>
      <AdminHeader title="Email" subtitle="Registro di tutte le email generate dalla piattaforma" />

      {!smtpConfigured && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          SMTP non configurato: le email non vengono inviate ma restano registrate qui (modalità
          test). Configura l&apos;invio reale da <strong>Impostazioni</strong>.
        </div>
      )}

      {emails.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna email generata finora.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {emails.map((e) => (
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
              </details>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
