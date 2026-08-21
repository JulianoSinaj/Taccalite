import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, NewButton, Pagination } from "@/components/admin/ui";
import { SegmentedFilter, FilterToolbar, ActiveFilters, labelFrom } from "@/components/admin/FilterBar";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { getRewardsPage } from "@/lib/admin/queries";
import { rewardFilters } from "@/lib/admin/filters";
import { deleteReward, toggleRewardActive } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

const BASE = "/admin/rewards";

const STATUS_CHIPS = [
  { value: "all", label: "Tutti" },
  { value: "attivi", label: "Attivi" },
  { value: "disattivati", label: "Disattivati" },
];

type SP = { searchParams: Promise<{ stato?: string; q?: string; page?: string }> };

export default async function AdminRewards({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = rewardFilters(sp);
  const { rows: rewards, total, pageCount } = await getRewardsPage({ ...filters, page });
  const filtered = Object.values(filters).some((v) => v && v !== "all");

  return (
    <div>
      <AdminHeader
        title="Premi"
        subtitle={`${total} premi nel catalogo fedeltà`}
        action={<NewButton href="/admin/rewards/new">+ Nuovo premio</NewButton>}
      />

      <SegmentedFilter
        basePath={BASE}
        params={filters}
        name="stato"
        options={STATUS_CHIPS}
        label="Filtra per stato"
      />
      <FilterToolbar
        basePath={BASE}
        params={filters}
        searchPlaceholder="Nome o slug…"
        carry={["stato"]}
        formId="rewards-filters"
      />
      <ActiveFilters
        basePath={BASE}
        params={filters}
        labels={{
          stato: { title: "Stato", format: labelFrom(STATUS_CHIPS) },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      {rewards.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {filtered
              ? "Nessun premio corrisponde ai filtri."
              : "Nessun premio ancora. Creane uno con «Nuovo premio»."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {rewards.map((r) => (
            <Panel key={r.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-display text-lg text-brown-950">{r.name}</p>
                  <p className="text-xs text-brown-800/60">
                    {r.points} punti{r.description ? ` · ${r.description}` : ""}
                  </p>
                </div>
                {!r.active && <StatusBadge status="cancelled" />}
              </div>
              <div className="flex items-center gap-2">
                <ActionForm action={toggleRewardActive} className="inline-flex">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                  <PendingButton tone="dark">{r.active ? "Disattiva" : "Attiva"}</PendingButton>
                </ActionForm>
                <Link
                  href={`/admin/rewards/${r.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Modifica
                </Link>
                <DeleteForm action={deleteReward} id={r.id} confirm={`Eliminare "${r.name}"?`} />
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={filters} />
    </div>
  );
}
