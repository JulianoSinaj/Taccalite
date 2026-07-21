import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, Pagination } from "@/components/admin/ui";
import { getAuditPage } from "@/lib/admin/queries";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "Tutto" },
  { key: "order", label: "Ordini" },
  { key: "user", label: "Utenti" },
  { key: "setting", label: "Impostazioni" },
  { key: "shop", label: "Negozi" },
  { key: "product", label: "Prodotti" },
];

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SP = { searchParams: Promise<{ entity?: string; page?: string }> };

export default async function AuditPage({ searchParams }: SP) {
  if (!(await isAdmin())) redirect("/admin");
  const sp = await searchParams;
  const entity = sp.entity ?? "all";
  const page = Number(sp.page) || 1;
  const { rows, page: current, pageCount } = await getAuditPage({ page, entity });

  return (
    <div>
      <AdminHeader
        title="Registro attività"
        subtitle="Traccia delle operazioni sensibili nel gestionale (chi ha fatto cosa)"
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/admin/audit" : `/admin/audit?entity=${f.key}`}
            className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              entity === f.key ? "bg-brown-950 text-cream" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">Nessuna attività registrata{entity !== "all" ? " per questo filtro" : ""}.</p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Panel key={r.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-brown-950">{r.summary}</p>
                <p className="mt-0.5 text-xs text-brown-800/60">
                  <span className="font-mono">{r.action}</span>
                  {r.actorName ? ` · ${r.actorName}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-brown-800/50">{fmtDateTime(r.createdAt)}</span>
            </Panel>
          ))}
        </div>
      )}

      <Pagination
        basePath="/admin/audit"
        page={current}
        pageCount={pageCount}
        params={{ entity: entity === "all" ? undefined : entity }}
      />
    </div>
  );
}
