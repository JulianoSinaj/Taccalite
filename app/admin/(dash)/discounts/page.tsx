import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, Panel, StatusBadge, euro, fmtDate, NewButton, Pagination } from "@/components/admin/ui";
import { SegmentedFilter, FilterToolbar, ActiveFilters, labelFrom } from "@/components/admin/FilterBar";
import { ActionForm, DeleteForm, PendingButton } from "@/components/admin/ActionForm";
import { getDiscountsPage } from "@/lib/admin/queries";
import { discountFilters } from "@/lib/admin/filters";
import { deleteDiscount, toggleDiscountActive } from "@/lib/admin/discount-actions";
import { isAdmin } from "@/lib/auth/session";
import type { DiscountCodeRow } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const BASE = "/admin/discounts";

const STATUS_CHIPS = [
  { value: "all", label: "Tutti" },
  { value: "attivi", label: "Attivi" },
  { value: "disattivati", label: "Disattivati" },
  { value: "esauriti", label: "Esauriti" },
];

const TYPE_CHIPS = [
  { value: "all", label: "Tutti i tipi" },
  { value: "percent", label: "Percentuale" },
  { value: "fixed", label: "Importo fisso" },
  { value: "free_shipping", label: "Spedizione gratis" },
];

/** Human description of what a code takes off. */
function describe(d: DiscountCodeRow): string {
  if (d.type === "percent") return `-${d.value}%`;
  if (d.type === "fixed") return `-${euro(d.value)}`;
  return "Spedizione gratuita";
}

type SP = { searchParams: Promise<{ stato?: string; tipo?: string; q?: string; page?: string }> };

export default async function AdminDiscounts({ searchParams }: SP) {
  // Coupons move money — admin only.
  if (!(await isAdmin())) redirect("/admin");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const filters = discountFilters(sp);
  const { rows: codes, total, pageCount } = await getDiscountsPage({ ...filters, page });
  const filtered = Object.values(filters).some((v) => v && v !== "all");

  return (
    <div>
      <AdminHeader
        title="Codici sconto"
        subtitle={`${total} codici · percentuali, importi fissi o spedizione gratuita`}
        action={<NewButton href="/admin/discounts/new">+ Nuovo codice</NewButton>}
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
          {codes.map((d) => {
            const capReached = d.maxRedemptions != null && d.timesUsed >= d.maxRedemptions;
            return (
              <Panel key={d.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="font-display text-lg tracking-wide text-brown-950">{d.code}</p>
                    <p className="text-xs text-brown-800/60">
                      {describe(d)}
                      {d.minSubtotalCents > 0 ? ` · min. ${euro(d.minSubtotalCents)}` : ""}
                      {` · usato ${d.timesUsed}${d.maxRedemptions != null ? `/${d.maxRedemptions}` : ""}`}
                      {d.startsAt || d.endsAt ? ` · ${fmtDate(d.startsAt)}–${fmtDate(d.endsAt)}` : ""}
                    </p>
                  </div>
                  {!d.active && <StatusBadge status="cancelled" />}
                  {capReached && <StatusBadge status="completed" />}
                </div>
                <div className="flex items-center gap-2">
                  <ActionForm action={toggleDiscountActive} className="inline-flex">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="active" value={d.active ? "false" : "true"} />
                    <PendingButton tone="dark">{d.active ? "Disattiva" : "Attiva"}</PendingButton>
                  </ActionForm>
                  <Link
                    href={`/admin/discounts/${d.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                  >
                    Modifica
                  </Link>
                  <DeleteForm action={deleteDiscount} id={d.id} confirm={`Eliminare il codice "${d.code}"?`} />
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={filters} />
    </div>
  );
}
