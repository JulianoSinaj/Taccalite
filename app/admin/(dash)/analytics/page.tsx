import { redirect } from "next/navigation";
import { AdminHeader, Panel } from "@/components/admin/ui";
import { getAnalyticsSummary } from "@/lib/analytics";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Panel>
      <p className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">{label}</p>
      <p className="font-display mt-1 text-3xl text-brown-950">{value.toLocaleString("it-IT")}</p>
    </Panel>
  );
}

export default async function AdminAnalytics() {
  if (!(await isAdmin())) redirect("/admin");
  const s = await getAnalyticsSummary();
  const maxDaily = Math.max(1, ...s.daily.map((d) => d.n));

  return (
    <div>
      <AdminHeader title="Statistiche" subtitle="Visite del sito — senza cookie, senza dati personali" />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Ultimi 7 giorni" value={s.last7} />
        <Stat label="Ultimi 30 giorni" value={s.last30} />
        <Stat label="Totali" value={s.total} />
      </div>

      <Panel className="mb-8">
        <h2 className="font-display mb-4 text-xl text-brown-950">Visite giornaliere · 14 giorni</h2>
        <div className="flex h-40 items-end gap-1.5">
          {s.daily.map((d) => (
            <div
              key={d.day}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              title={`${d.day}: ${d.n} visite`}
            >
              <div
                className="w-full rounded-t bg-gold"
                style={{ height: `${Math.round((d.n / maxDaily) * 100)}%`, minHeight: d.n > 0 ? "4px" : "0" }}
              />
              <span className="text-[9px] text-brown-800/50">{d.day.slice(8)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <h2 className="font-display mb-4 text-xl text-brown-950">Pagine più viste · 30 giorni</h2>
          {s.topPaths.length === 0 ? (
            <p className="text-brown-800/70">Nessun dato ancora.</p>
          ) : (
            <ul className="divide-y divide-brown-900/10">
              {s.topPaths.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-4 py-2">
                  <span className="truncate font-mono text-sm text-brown-900">{p.path}</span>
                  <span className="font-display text-lg text-brown-950">{p.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <h2 className="font-display mb-4 text-xl text-brown-950">Provenienza · 30 giorni</h2>
          {s.topReferrers.length === 0 ? (
            <p className="text-brown-800/70">Traffico diretto o nessun referrer.</p>
          ) : (
            <ul className="divide-y divide-brown-900/10">
              {s.topReferrers.map((r) => (
                <li key={r.referrer ?? "—"} className="flex items-center justify-between gap-4 py-2">
                  <span className="truncate text-sm text-brown-900">{r.referrer}</span>
                  <span className="font-display text-lg text-brown-950">{r.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
