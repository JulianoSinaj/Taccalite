import { redirect } from "next/navigation";
import { AdminHeader, Panel, Pagination, fmtDateTime, inputCls, labelCls } from "@/components/admin/ui";
import { FilterChips, FilterSearch, filterHref } from "@/components/admin/FilterBar";
import { getAuditPage } from "@/lib/admin/queries";
import { auditFilters, filterQuery } from "@/lib/admin/filters";
import { isAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const BASE = "/admin/audit";

/** Italian labels for the entities the log records. */
const ENTITY_LABELS: Record<string, string> = {
  order: "Ordini",
  reservation: "Prenotazioni",
  user: "Utenti",
  setting: "Impostazioni",
  shop: "Negozi",
  product: "Prodotti",
  discount: "Codici sconto",
  reward: "Premi",
  redemption: "Riscatti",
  blog_post: "News",
  campaign: "Newsletter",
};

/** Render a logged `meta` payload as readable key/value pairs. */
function MetaTable({ meta }: { meta: Record<string, unknown> }) {
  const entries = Object.entries(meta);
  if (entries.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg bg-cream/60 px-3 py-2 text-xs sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3">
          <dt className="font-mono text-brown-800/60">{k}</dt>
          <dd className="truncate text-right text-brown-900" title={String(v)}>
            {v === null || v === undefined
              ? "—"
              : typeof v === "object"
                ? JSON.stringify(v)
                : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type SP = {
  searchParams: Promise<{
    entity?: string;
    attore?: string;
    q?: string;
    da?: string;
    a?: string;
    page?: string;
  }>;
};

export default async function AuditPage({ searchParams }: SP) {
  if (!(await isAdmin())) redirect("/admin");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = auditFilters(sp);
  const { rows, page: current, pageCount, total, actors, entities } = await getAuditPage({
    ...filters,
    page,
  });
  const filtered = Object.values(filters).some((v) => v && v !== "all");

  return (
    <div>
      <AdminHeader
        title="Registro attività"
        subtitle={`${total} operazioni registrate${filtered ? " nel filtro attuale" : ""}`}
        action={
          <a
            href={`/api/admin/export/audit${filterQuery(filters)}`}
            download
            className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Esporta CSV
          </a>
        }
      />

      <FilterChips
        basePath={BASE}
        params={filters}
        name="entity"
        options={[
          { value: "all", label: "Tutto" },
          ...entities.map((e) => ({ value: e, label: ENTITY_LABELS[e] ?? e })),
        ]}
        tone="dark"
      />
      <FilterChips
        basePath={BASE}
        params={filters}
        name="attore"
        options={[
          { value: "all", label: "Chiunque" },
          ...actors.map((a) => ({ value: a.id, label: a.name || a.id })),
        ]}
        className="mb-4"
      />

      {/* Date range — its own GET form so it can carry both bounds at once. */}
      <form action={BASE} method="get" className="mb-4 flex flex-wrap items-end gap-3">
        {Object.entries(filters)
          .filter(([k, v]) => k !== "da" && k !== "a" && v && v !== "all")
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <div>
          <label className={labelCls} htmlFor="audit-da">
            Dal
          </label>
          <input id="audit-da" type="date" name="da" defaultValue={filters.da ?? ""} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="audit-a">
            Al
          </label>
          <input id="audit-a" type="date" name="a" defaultValue={filters.a ?? ""} className={inputCls} />
        </div>
        <button
          type="submit"
          className="rounded-full bg-brown-950 px-5 py-2.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
        >
          Filtra
        </button>
        {(filters.da || filters.a) && (
          <a
            href={filterHref(BASE, filters, { da: undefined, a: undefined })}
            className="rounded-full bg-brown-900/10 px-5 py-2.5 text-xs font-bold tracking-widest text-brown-800 uppercase hover:bg-brown-900/15"
          >
            Azzera date
          </a>
        )}
      </form>

      <FilterSearch basePath={BASE} params={filters} placeholder="Descrizione, azione o id…" />

      {rows.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {filtered ? "Nessuna attività corrisponde ai filtri." : "Nessuna attività registrata."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Panel key={r.id}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-brown-950">{r.summary}</p>
                  <p className="mt-0.5 text-xs text-brown-800/60">
                    <span className="font-mono">{r.action}</span>
                    {r.actorName ? ` · ${r.actorName}` : ""}
                    {r.entityId ? ` · ${r.entityId}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-brown-800/50">{fmtDateTime(r.createdAt)}</span>
              </div>
              {r.meta && <MetaTable meta={r.meta} />}
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath={BASE} page={current} pageCount={pageCount} params={filters} />
    </div>
  );
}
