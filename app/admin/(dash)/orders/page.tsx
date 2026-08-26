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
import { DataTable } from "@/components/admin/DataTable";
import { BulkBar, BulkCheckbox } from "@/components/admin/BulkBar";
import { SavedViews } from "@/components/admin/SavedViews";
import { updateOrderStatus, bulkUpdateOrderStatus } from "@/lib/admin/order-actions";
import { FULFILMENT_SHORT } from "@/lib/fulfilment";
import { PAYMENT_METHOD_SHORT, settlesOnHandover } from "@/lib/payments/methods";
import { isAdmin, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { orderItems } from "@/lib/db/schema";
import { shopScope, lockShop, shopChips } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

/** Ties the row checkboxes to the bulk bar's form (see BulkBar). */
const BULK_FORM = "bulk-orders";

type SP = {
  searchParams: Promise<{
    negozio?: string;
    q?: string;
    stato?: string;
    tipo?: string;
    metodo?: string;
    da?: string;
    a?: string;
    data?: string;
    page?: string;
    colonna?: string;
    verso?: string;
  }>;
};

const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "to-fulfil", label: "Da evadere" },
  { value: "unpaid", label: "Da pagare" },
  // "Money actually taken", regardless of where the order got to afterwards.
  // This is the set the IVA report counts, and it had no chip.
  { value: "incassati", label: "Incassati" },
  { value: "fulfilled", label: "Evasi" },
  { value: "cancelled", label: "Annullati" },
  { value: "refunded", label: "Rimborsati" },
];

/** Which date the range applies to — see `OrderFilters["data"]`. */
const DATE_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Data ordine" },
  { value: "incasso", label: "Data incasso" },
  { value: "ritiro", label: "Data ritiro" },
];

const FULFILMENT_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti i tipi" },
  { value: "pickup", label: "Ritiro" },
  { value: "delivery", label: "Consegna" },
  { value: "shipping", label: "Spedizione" },
];

/** "Which contrassegni does the driver collect for today" had no answer here. */
const METHOD_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti i pagamenti" },
  { value: "card", label: PAYMENT_METHOD_SHORT.card },
  { value: "in_store", label: PAYMENT_METHOD_SHORT.in_store },
  { value: "on_delivery", label: PAYMENT_METHOD_SHORT.on_delivery },
  { value: "counter", label: PAYMENT_METHOD_SHORT.counter },
];

const BASE = "/admin/orders";

export default async function AdminOrders({ searchParams }: SP) {
  const sp = await searchParams;
  const { q, stato = "all", tipo = "all", metodo = "all", da = "", a = "", page: pageStr } = sp;
  const page = Number(pageStr) || 1;
  // A staff account assigned to a location is *confined* to it: the facet is
  // forced here rather than merely pre-selected, so editing the query string
  // cannot widen the view. Admins and unassigned accounts see everything.
  const scope = await shopScope();
  const filters = orderFilters({ ...sp, negozio: lockShop(sp.negozio, scope) });
  const sort = sortFilters(sp, ORDER_SORTS, { colonna: "data", verso: "desc" });
  const viewer = await getCurrentUser();
  const [{ rows: orders, total, pageCount }, shops, admin, views] = await Promise.all([
    getOrdersPage({ ...filters, page, sort }),
    adminGetShops(),
    isAdmin(),
    viewer ? getSavedViews(viewer.id, BASE) : Promise.resolve([]),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));
  // Carried on every sort/page link so the view survives navigation.
  const linkParams = { ...filters, colonna: sort.colonna, verso: sort.verso };

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

  // The active filter bag the shared chrome reads from. It reads the **locked**
  // shop, not the one in the query string: built from the raw params, a scoped
  // operator clicking another sede saw the chip highlight move while the results
  // stayed put — the page advertising a filter it was not honouring. The
  // products list has always done it this way; these two disagreed.
  const current = {
    negozio: filters.negozio ?? "all",
    stato,
    tipo,
    metodo,
    da,
    a,
    data: filters.data ?? "all",
    ...(q ? { q } : {}),
  };
  // …and no chips for locations this operator can never open.
  const SHOP_CHIPS = shopChips(shops, scope);

  return (
    <div>
      <AdminHeader
        title="Ordini"
        subtitle={`${total} ordini`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/orders/new"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-4 py-2 text-xs font-bold tracking-widest text-on-gold uppercase hover:bg-gold-dark"
            >
              + Nuovo ordine
            </Link>
            {admin ? (
              <>
                {/* Two downloads because they answer different questions: the
                    order-level one is takings, the line-level one is what was
                    actually sold. Same filters feed both. */}
                <a
                  href={`/api/admin/export/order-items${filterQuery(filters)}`}
                  download
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                  title="Una riga per articolo venduto, con gli stessi filtri"
                >
                  CSV righe
                </a>
                <a
                  href={`/api/admin/export/orders${filterQuery(filters)}`}
                  download
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Esporta CSV
                </a>
              </>
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
          { name: "metodo", label: "Pagamento", options: METHOD_CHIPS },
          { name: "data", label: "Periodo su", options: DATE_CHIPS },
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
          metodo: { title: "Pagamento", format: labelFrom(METHOD_CHIPS) },
          data: { title: "Periodo su", format: labelFrom(DATE_CHIPS) },
          da: { title: "Dal" },
          a: { title: "Al" },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* "Cosa devo evadere oggi" was three facets to re-select every morning. */}
        <SavedViews path={BASE} views={views} currentQuery={filterQuery(filters).replace(/^\?/, "")} />
      </div>

      <BulkBar
        formId={BULK_FORM}
        action={bulkUpdateOrderStatus}
        label="ordini"
        options={[
          { value: "fulfilled", label: "Segna evasi" },
          // One gesture, two targets: paid → "da evadere", unpaid → "in attesa".
          { value: "reopen", label: "Riporta da evadere" },
          { value: "cancelled", label: "Annulla (solo non pagati)" },
        ]}
        confirmTemplate="Applicare l'azione a {n} ordini? I clienti riceveranno le email previste. Gli ordini per cui non è consentita vengono saltati."
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
        empty={
          q || stato !== "all" || tipo !== "all" || metodo !== "all" || current.negozio !== "all"
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
                {/* "Da pagare" alone doesn't distinguish an abandoned card
                    checkout from a live order the customer will pay for on
                    collection — opposite meanings, opposite actions. */}
                {o.paymentStatus === "unpaid" && settlesOnHandover(o.paymentMethod) && (
                  <span className="border border-gold-dark/50 bg-gold/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-brown-950 uppercase">
                    {PAYMENT_METHOD_SHORT[o.paymentMethod]}
                  </span>
                )}
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
