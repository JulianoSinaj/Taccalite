import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  AdminHeader,
  Panel,
  StatusBadge,
  TableSkeleton,
  euro,
  fmtDate,
  NewButton,
  Pagination,
} from "@/components/admin/ui";
import { SegmentedFilter, FilterToolbar, ActiveFilters, labelFrom } from "@/components/admin/FilterBar";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { getDiscountsPage, adminGetShops } from "@/lib/admin/queries";
import { discountFilters, filterQuery } from "@/lib/admin/filters";
import { TotalSubtitle } from "@/components/admin/Streamed";
import { deleteDiscount, toggleDiscountActive } from "@/lib/admin/discount-actions";
import { discountState } from "@/lib/discounts";
import { isAdmin } from "@/lib/auth/session";
import type { DiscountCodeRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const BASE = "/admin/discounts";

/** One chip per `discountState`, so a code appears under exactly one. */
const STATUS_CHIPS = [
  { value: "all", label: "Tutti" },
  { value: "attivi", label: "Attivi" },
  { value: "programmati", label: "Programmati" },
  { value: "scaduti", label: "Scaduti" },
  { value: "esauriti", label: "Esauriti" },
  { value: "disattivati", label: "Disattivati" },
];

const TYPE_CHIPS = [
  { value: "all", label: "Tutti i tipi" },
  { value: "percent", label: "Percentuale" },
  { value: "fixed", label: "Importo fisso" },
  { value: "free_shipping", label: "Spedizione gratis" },
];

type Row = DiscountCodeRow & { redeemedCents: number };

/** Human description of what a code takes off. */
function describe(d: DiscountCodeRow): string {
  if (d.type === "percent") return `-${d.value}%`;
  if (d.type === "fixed") return `-${euro(d.value)}`;
  return "Spedizione gratuita";
}

/** The validity window, only when there is one; an open end reads as such. */
function validity(d: DiscountCodeRow): string | null {
  if (d.startsAt && d.endsAt) return `${fmtDate(d.startsAt)} – ${fmtDate(d.endsAt)}`;
  if (d.startsAt) return `dal ${fmtDate(d.startsAt)}`;
  if (d.endsAt) return `fino al ${fmtDate(d.endsAt)}`;
  return null;
}

function Restriction({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-brown-900/5 px-2.5 py-1 text-[11px] font-semibold text-brown-800/70">
      {children}
    </span>
  );
}

function DiscountRow({ d, shopName }: { d: Row; shopName?: string }) {
  const state = discountState(d);
  const used = d.timesUsed > 0;
  const facts = [
    describe(d),
    d.minSubtotalCents > 0 ? `min. ${euro(d.minSubtotalCents)}` : null,
    `usato ${d.timesUsed}${d.maxRedemptions != null ? `/${d.maxRedemptions}` : ""}`,
    d.redeemedCents > 0 ? `${euro(d.redeemedCents)} scontati` : null,
    validity(d),
  ].filter(Boolean);
  // The rules that decide who may use it — invisible on the list until now,
  // so a code "nobody can apply" had to be opened to find out why.
  const restrictions = [
    d.shopSlug ? `Solo ${shopName ?? d.shopSlug}` : null,
    d.firstOrderOnly ? "Solo 1º ordine" : null,
    d.maxPerCustomer != null ? `Max ${d.maxPerCustomer} per cliente` : null,
  ].filter(Boolean);

  return (
    <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg tracking-wide text-brown-950">{d.code}</p>
          {state !== "active" && <StatusBadge status={state} />}
        </div>
        <p className="text-xs text-brown-800/70">{facts.join(" · ")}</p>
        {restrictions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {restrictions.map((r) => (
              <Restriction key={r}>{r}</Restriction>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <ActionForm action={toggleDiscountActive} className="inline-flex">
          <input type="hidden" name="id" value={d.id} />
          <input type="hidden" name="active" value={d.active ? "false" : "true"} />
          <PendingButton tone="dark">{d.active ? "Disattiva" : "Attiva"}</PendingButton>
        </ActionForm>
        <Link
          href={`${BASE}/${d.id}`}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
        >
          {used ? "Dettagli" : "Modifica"}
        </Link>
        {/* A used code is history and the server refuses to delete it; the
            button only produced that error. Deactivating is the way out. */}
        {!used && <DeleteForm action={deleteDiscount} id={d.id} confirm={`Eliminare il codice "${d.code}"?`} />}
      </div>
    </Panel>
  );
}

type SP = { searchParams: Promise<{ stato?: string; tipo?: string; q?: string; page?: string }> };

export default async function AdminDiscounts({ searchParams }: SP) {
  // Coupons move money — admin only.
  if (!(await isAdmin())) redirect("/admin");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = discountFilters(sp);
  // Started, not awaited — the chrome must not wait on the rows.
  const promise = getDiscountsPage({ ...filters, page });
  const shops = await adminGetShops();
  const shopNames = new Map(shops.map((s) => [s.slug, s.name]));
  const filtered = Object.values(filters).some((v) => v && v !== "all");

  return (
    <div>
      <AdminHeader
        title="Codici sconto"
        subtitle={
          <TotalSubtitle
            promise={promise}
            one="codice"
            many="codici"
            suffix=" · percentuali, importi fissi o spedizione gratuita"
          />
        }
        action={
          <div className="flex flex-wrap gap-2">
            {/* Which code cost how much, on which order — the whole ledger,
                which is what "what did the campaign cost us" needs. */}
            <a
              href="/api/admin/export/discount-usage"
              download
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Utilizzi CSV
            </a>
            <NewButton href={`${BASE}/new`}>+ Nuovo codice</NewButton>
          </div>
        }
      />

      <SegmentedFilter
        basePath={BASE}
        params={filters}
        name="stato"
        options={STATUS_CHIPS}
        label="Filtra per stato del codice"
      />
      <FilterToolbar
        basePath={BASE}
        params={filters}
        searchPlaceholder="Codice…"
        carry={["stato"]}
        formId="discounts-filters"
        facets={[{ name: "tipo", label: "Tipo", options: TYPE_CHIPS }]}
      />
      <ActiveFilters
        basePath={BASE}
        params={filters}
        labels={{
          stato: { title: "Stato", format: labelFrom(STATUS_CHIPS) },
          tipo: { title: "Tipo", format: labelFrom(TYPE_CHIPS) },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      {/* Only the codes wait on the query. */}
      <Suspense key={filterQuery({ ...filters, page: String(page) })} fallback={<TableSkeleton rows={5} />}>
        <DiscountList promise={promise} shopNames={shopNames} page={page} filters={filters} filtered={filtered} />
      </Suspense>
    </div>
  );
}

async function DiscountList({
  promise,
  shopNames,
  page,
  filters,
  filtered,
}: {
  promise: ReturnType<typeof getDiscountsPage>;
  shopNames: Map<string, string>;
  page: number;
  filters: Record<string, string | undefined>;
  filtered: boolean;
}) {
  const { rows: codes, pageCount } = await promise;
  return (
    <>
      {codes.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {filtered
              ? "Nessun codice corrisponde ai filtri."
              : "Nessun codice sconto ancora. Creane uno con «Nuovo codice»."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {codes.map((d) => (
            <DiscountRow key={d.id} d={d} shopName={d.shopSlug ? shopNames.get(d.shopSlug) : undefined} />
          ))}
        </div>
      )}

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={filters} />
    </>
  );
}
