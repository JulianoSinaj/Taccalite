import Link from "next/link";
import { Suspense } from "react";
import { AdminHeader, Panel, StatusBadge, TableSkeleton, NewButton, Pagination } from "@/components/admin/ui";
import { SegmentedFilter, FilterToolbar, ActiveFilters, labelFrom } from "@/components/admin/FilterBar";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { getRewardsPage, getRewardsAttention } from "@/lib/admin/queries";
import { TotalSubtitle } from "@/components/admin/Streamed";
import { rewardFilters, filterQuery } from "@/lib/admin/filters";
import { deleteReward, toggleRewardActive } from "@/lib/admin/actions";

export const dynamic = "force-dynamic";

const BASE = "/admin/rewards";

type WindowFields = { availableFrom: Date | null; availableUntil: Date | null };

/** Where a reward sits relative to its availability window, if it has one. */
function windowState(r: WindowFields, now: Date): "not_yet" | "expired" | null {
  if (r.availableFrom && now < r.availableFrom) return "not_yet";
  if (r.availableUntil && now > r.availableUntil) return "expired";
  return null;
}

/** "dal 1 dicembre al 6 gennaio", or empty when the reward is always on. */
function windowLabel(r: WindowFields): string {
  const d = (x: Date) => x.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  if (r.availableFrom && r.availableUntil) return `dal ${d(r.availableFrom)} al ${d(r.availableUntil)}`;
  if (r.availableFrom) return `dal ${d(r.availableFrom)}`;
  if (r.availableUntil) return `fino al ${d(r.availableUntil)}`;
  return "";
}

/** Small state pill, matching the one on the users list. */
function Tag({ tone, children }: { tone: "warn" | "bad" | "mute"; children: React.ReactNode }) {
  const tones = {
    warn: "bg-warn-soft text-warn-soft-fg",
    bad: "bg-danger-solid/15 text-danger",
    mute: "bg-brown-900/10 text-brown-800",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${tones[tone]}`}>
      {children}
    </span>
  );
}

const STATUS_CHIPS = [
  { value: "all", label: "Tutti" },
  { value: "attivi", label: "Attivi" },
  { value: "esauriti", label: "Esauriti" },
  { value: "scaduti", label: "Fuori periodo" },
  { value: "disattivati", label: "Disattivati" },
];

type SP = { searchParams: Promise<{ stato?: string; q?: string; page?: string }> };

export default async function AdminRewards({ searchParams }: SP) {
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = rewardFilters(sp);
  // Resolved once and passed down so the query, the chips and every row agree
  // on "now" — and so no `new Date()` runs in the render body.
  const now = new Date();
  // Started, not awaited — see components/admin/Streamed.
  const promise = getRewardsPage({ ...filters, page, now });
  const { outOfStock, expired } = await getRewardsAttention(now);
  const filtered = Object.values(filters).some((v) => v && v !== "all");
  const needsAttention = outOfStock + expired;

  return (
    <div>
      <AdminHeader
        title="Premi"
        subtitle={
          <TotalSubtitle
            promise={promise}
            one="premio"
            many="premi"
            suffix={` nel catalogo fedeltà${needsAttention > 0 ? ` · ${needsAttention} da sistemare` : ""}`}
          />
        }
        action={<NewButton href="/admin/rewards/new">+ Nuovo premio</NewButton>}
      />

      {/* An active reward with no stock left is still listed to the customer,
          marked "Esaurito" — but it is the shop that has to restock it or turn
          it off, and until this banner there was nowhere that said so. */}
      {needsAttention > 0 && !filtered && (
        <div className="mb-6 rounded-2xl border border-warn/40 bg-warn-soft px-5 py-4 text-sm text-warn-soft-fg">
          {outOfStock > 0 && (
            <>
              {outOfStock === 1 ? "1 premio attivo è esaurito" : `${outOfStock} premi attivi sono esauriti`}
              {expired > 0 ? " · " : ". "}
            </>
          )}
          {expired > 0 && (
            <>
              {expired === 1
                ? "1 premio attivo è fuori dal suo periodo"
                : `${expired} premi attivi sono fuori dal loro periodo`}
              .{" "}
            </>
          )}
          I clienti li vedono barrati e non possono riscattarli: rifornisci le scorte, sposta il
          periodo o disattivali.
        </div>
      )}

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

      {/* Only the catalogue waits on the query; the banner above is a
          whole-catalogue figure and renders first. */}
      <Suspense key={filterQuery({ ...filters, page: String(page) })} fallback={<TableSkeleton rows={5} />}>
        <RewardList promise={promise} now={now} page={page} filters={filters} filtered={filtered} />
      </Suspense>
    </div>
  );
}


async function RewardList({
  promise,
  now,
  page,
  filters,
  filtered,
}: {
  promise: ReturnType<typeof getRewardsPage>;
  now: Date;
  page: number;
  filters: Record<string, string | undefined>;
  filtered: boolean;
}) {
  const { rows: rewards, pageCount } = await promise;
  return (
    <>
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
                  <div className="flex min-w-0 items-center gap-3">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, any host
                      <img
                        src={r.image}
                        alt=""
                        className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-brown-900/10"
                      />
                    ) : (
                      <span
                        aria-hidden
                        title="Senza immagine"
                        className="size-12 shrink-0 rounded-lg bg-brown-900/5 ring-1 ring-brown-900/10"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-display flex flex-wrap items-center gap-1.5 text-lg text-brown-950">
                        <Link href={`/admin/rewards/${r.id}`} className="hover:underline">
                          {r.name}
                        </Link>
                        {/* Stock, window and per-customer cap are all enforced at
                            redemption and none of them were visible here, so a
                            reward with nothing left looked exactly like one with
                            fifty. */}
                        {r.stock != null && (
                          <Tag tone={r.stock <= 0 ? "bad" : r.stock <= 3 ? "warn" : "mute"}>
                            {r.stock <= 0 ? "Esaurito" : `${r.stock} rimasti`}
                          </Tag>
                        )}
                        {r.active && windowState(r, now) === "expired" && <Tag tone="bad">Periodo finito</Tag>}
                        {r.active && windowState(r, now) === "not_yet" && <Tag tone="warn">Non ancora attivo</Tag>}
                      </p>
                      <p className="text-xs text-brown-800/70">
                        {r.points} punti
                        {r.maxPerCustomer != null
                          ? ` · max ${r.maxPerCustomer} a cliente`
                          : ""}
                        {windowLabel(r) ? ` · ${windowLabel(r)}` : ""}
                        {" · "}
                        {Number(r.pendingRedemptions) > 0 ? (
                          <Link
                            href={`/admin/loyalty?rq=${encodeURIComponent(r.name)}&rstato=pending`}
                            className="font-bold text-warn-soft-fg hover:underline"
                          >
                            {r.pendingRedemptions} da consegnare
                          </Link>
                        ) : (
                          `${r.totalRedemptions} riscatti`
                        )}
                      </p>
                      {r.description && (
                        <p className="line-clamp-1 text-xs text-brown-800/70">{r.description}</p>
                      )}
                    </div>
                    {!r.active && <StatusBadge status="inactive" />}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
    </>
  );
}