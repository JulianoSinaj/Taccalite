import Link from "next/link";
import { inArray } from "drizzle-orm";
import {
  AdminHeader,
  StatusBadge,
  euro,
  fmtDate,
  fmtDateTime,
  inputCls,
  labelCls,
  Pagination,
} from "@/components/admin/ui";
import {
  SegmentedFilter,
  FilterToolbar,
  ActiveFilters,
  labelFrom,
} from "@/components/admin/FilterBar";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getOrdersPage, adminGetShops, getSavedViews, ORDER_SORTS } from "@/lib/admin/queries";
import { orderFilters, sortFilters, filterQuery } from "@/lib/admin/filters";
import { DataTable, DensityToggle, densityFrom } from "@/components/admin/DataTable";
import { BulkBar, BulkCheckbox } from "@/components/admin/BulkBar";
import { SavedViews } from "@/components/admin/SavedViews";
import { updateOrderStatus, bulkUpdateOrderStatus } from "@/lib/admin/order-actions";
import { FULFILMENT_SHORT } from "@/lib/fulfilment";
import { isAdmin, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { orderItems } from "@/lib/db/schema";
import { shopScope, lockShop } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

/** Ties the row checkboxes to the bulk bar's form (see BulkBar). */
const BULK_FORM = "bulk-orders";

type SP = {
  searchParams: Promise<{
    negozio?: string;
    q?: string;
    stato?: string;
    tipo?: string;
    da?: string;
    a?: string;
    page?: string;
    colonna?: string;
    verso?: string;
    densita?: string;
  }>;
};

const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "to-fulfil", label: "Da evadere" },
  { value: "unpaid", label: "Da pagare" },
  { value: "fulfilled", label: "Evasi" },
  { value: "cancelled", label: "Annullati" },
  { value: "refunded", label: "Rimborsati" },
];

const FULFILMENT_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti i tipi" },
  { value: "pickup", label: "Ritiro" },
  { value: "delivery", label: "Consegna" },
  { value: "shipping", label: "Spedizione" },
];

const BASE = "/admin/orders";

export default async function AdminOrders({ searchParams }: SP) {
  const sp = await searchParams;
  const { negozio = "all", q, stato = "all", tipo = "all", da = "", a = "", page: pageStr } = sp;
  const page = Number(pageStr) || 1;
  // A staff account assigned to a location is *confined* to it: the facet is
  // forced here rather than merely pre-selected, so editing the query string
  // cannot widen the view. Admins and unassigned accounts see everything.
  const scope = await shopScope();
  const filters = orderFilters({ ...sp, negozio: lockShop(sp.negozio, scope) });
  const sort = sortFilters(sp, ORDER_SORTS, { colonna: "data", verso: "desc" });
  const density = densityFrom(sp.densita);
  const viewer = await getCurrentUser();
  const [{ rows: orders, total, pageCount }, shops, admin, views] = await Promise.all([
    getOrdersPage({ ...filters, page, sort }),
    adminGetShops(),
    isAdmin(),
    viewer ? getSavedViews(viewer.id, BASE) : Promise.resolve([]),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));
  // Carried on every sort/density/page link so the view survives navigation.
  const linkParams = { ...filters, colonna: sort.colonna, verso: sort.verso, densita: sp.densita };

  // Per-order item preview: fetch line items for the current page in one query,
  // then group into a total-quantity count + the first product names.
  const ids = orders.map((o) => o.id);
  const items = ids.length
    ? await db
        .select({ orderId: orderItems.orderId, name: orderItems.name, quantity: orderItems.quantity })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
    : [];
  const preview = new Map<string, { count: number; names: string[] }>();
  for (const it of items) {
    const p = preview.get(it.orderId) ?? { count: 0, names: [] };
    p.count += it.quantity;
    p.names.push(it.name);
    preview.set(it.orderId, p);
  }
  const previewText = (orderId: string): string | null => {
    const p = preview.get(orderId);
    if (!p || p.count === 0) return null;
    const shown = p.names.slice(0, 2).join(", ");
    const more = p.names.length > 2 ? "…" : "";
    return `${p.count} art. · ${shown}${more}`;
  };

  // The active filter bag the shared chrome reads from.
  const current = { negozio, stato, tipo, da, a, ...(q ? { q } : {}) };
  const SHOP_CHIPS = [
    { value: "all", label: "Tutte le sedi" },
    ...shops.map((s) => ({ value: s.slug, label: s.name })),
  ];

  return (
    <div>
      <AdminHeader
        title="Ordini"
        subtitle={`${total} ordini`}
        action={
          <div className="flex gap-2">
            <Link
              href="/admin/orders/new"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-4 py-2 text-xs font-bold tracking-widest text-on-gold uppercase hover:bg-gold-dark"
            >
              + Nuovo ordine
            </Link>
            {admin ? (
                <a
                href={`/api/admin/export/orders${filterQuery(filters)}`}
                download
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Esporta CSV
              </a>
            ) : null}
          </div>
        }
      />

      {/* Status is the facet the counter flips all day ("what's left to hand
          over?"), so it stays one click away; shop and fulfilment are set once
          and forgotten, so they live in the toolbar. */}
      <SegmentedFilter
        basePath={BASE}
        params={current}
        name="stato"
        options={STATUS_CHIPS}
        label="Filtra per stato ordine"
      />

      <FilterToolbar
        basePath={BASE}
        params={current}
        searchPlaceholder="Numero, nome o email…"
        carry={["stato"]}
        formId="orders-filters"
        facets={[
          { name: "negozio", label: "Sede", options: SHOP_CHIPS },
          { name: "tipo", label: "Consegna", options: FULFILMENT_CHIPS },
        ]}
      >
        <div>
          <label className={labelCls} htmlFor="ord-da">
            Dal
          </label>
          <input id="ord-da" type="date" name="da" defaultValue={da} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="ord-a">
            Al
          </label>
          <input id="ord-a" type="date" name="a" defaultValue={a} className={inputCls} />
        </div>
      </FilterToolbar>

      <ActiveFilters
        basePath={BASE}
        params={current}
        labels={{
          stato: { title: "Stato", format: labelFrom(STATUS_CHIPS) },
          negozio: { title: "Sede", format: labelFrom(SHOP_CHIPS) },
          tipo: { title: "Consegna", format: labelFrom(FULFILMENT_CHIPS) },
          da: { title: "Dal" },
          a: { title: "Al" },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* "Cosa devo evadere oggi" was three facets to re-select every morning. */}
        <SavedViews path={BASE} views={views} currentQuery={filterQuery(filters).replace(/^\?/, "")} />
        <DensityToggle basePath={BASE} params={linkParams} density={density} />
      </div>

      <BulkBar
        formId={BULK_FORM}
        action={bulkUpdateOrderStatus}
        label="ordini"
        options={[
          { value: "fulfilled", label: "Segna evasi" },
          { value: "pending", label: "Rimetti in attesa" },
          { value: "cancelled", label: "Annulla" },
        ]}
        confirmTemplate="Applicare l'azione a {n} ordini? I clienti riceveranno le email previste."
      />

      {/* A sortable table, now that the detail page carries the heavy actions.
          Card-per-row couldn't be sorted or scanned at volume, which is what a
          list of orders is for. */}
      <DataTable
        rows={orders}
        rowKey={(o) => o.id}
        basePath={BASE}
        params={linkParams}
        sort={sort}
        density={density}
        empty={
          q || stato !== "all" || tipo !== "all" || negozio !== "all"
            ? "Nessun ordine corrisponde ai filtri."
            : "Nessun ordine ancora. Gli ordini dallo shop online compaiono qui."
        }
        columns={[
          {
            // The select box lives inside the identity cell rather than in a
            // column of its own: one column fewer on a narrow screen, and the
            // pinned column then carries both the tick and what it ticks. The
            // checkbox joins the bulk form through `form="…"`, so where it sits
            // in the DOM makes no difference to the submission.
            key: "numero",
            header: "Ordine",
            sortable: true,
            sticky: true,
            cell: (o) => (
              <div className="flex items-start gap-3">
                <BulkCheckbox formId={BULK_FORM} id={o.id} label={`Seleziona ordine ${o.orderNumber}`} />
                <div>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-mono text-xs font-bold whitespace-nowrap text-brown-950 hover:underline"
                  >
                    {o.orderNumber}
                  </Link>
                  <p className="mt-0.5 text-xs whitespace-nowrap text-brown-800/50">{fmtDate(o.createdAt)}</p>
                </div>
              </div>
            ),
          },
          {
            key: "cliente",
            header: "Cliente",
            sortable: true,
            cell: (o) => {
              const prev = previewText(o.id);
              return (
                <div>
                  <p className="font-semibold text-brown-950">{o.name}</p>
                  <p className="text-xs text-brown-800/60">{o.email}</p>
                  {prev && <p className="text-xs text-brown-800/50">{prev}</p>}
                </div>
              );
            },
          },
          {
            key: "consegna",
            header: "Consegna",
            hideOnMobile: true,
            cell: (o) => (
              <span className="text-brown-800/70">
                {FULFILMENT_SHORT[o.fulfilment]}
                {o.shopSlug ? ` · ${shopName.get(o.shopSlug) ?? o.shopSlug}` : ""}
                {o.pickupSlotAt ? ` · ${fmtDateTime(o.pickupSlotAt)}` : ""}
              </span>
            ),
          },
          {
            key: "stato",
            header: "Stato",
            sortable: true,
            cell: (o) => (
              <div className="flex flex-wrap gap-1">
                <StatusBadge status={o.status} />
                <StatusBadge status={o.paymentStatus} />
              </div>
            ),
          },
          {
            key: "totale",
            header: "Totale",
            sortable: true,
            align: "right",
            cell: (o) => (
              <div className="tabular-nums">
                <span className="font-semibold text-brown-950">{euro(o.totalCents)}</span>
                {o.refundedCents > 0 && (
                  <p className="text-xs text-danger">−{euro(o.refundedCents)}</p>
                )}
              </div>
            ),
          },
          {
            key: "azioni",
            header: <span className="sr-only">Azioni</span>,
            align: "right",
            cell: (o) => (
              <div className="flex items-center justify-end gap-1.5">
                {/* The overwhelmingly common next step for a paid pickup order
                    is "handed over" — one tap, not two selects. */}
                {o.status === "paid" && o.fulfilment !== "shipping" && (
                  <ActionForm action={updateOrderStatus} className="inline-flex">
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="status" value="fulfilled" />
                    <input type="hidden" name="paymentStatus" value={o.paymentStatus} />
                    <PendingButton tone="gold">✓ Consegnato</PendingButton>
                  </ActionForm>
                )}
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-3 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Dettaglio
                </Link>
              </div>
            ),
          },
        ]}
      />

      <Pagination basePath={BASE} page={page} pageCount={pageCount} params={linkParams} />
    </div>
  );
}
