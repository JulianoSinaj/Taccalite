import Link from "next/link";
import { inArray } from "drizzle-orm";
import { AdminHeader, Panel, StatusBadge, euro, fmtDate, inputCls, Pagination } from "@/components/admin/ui";
import {
  SegmentedFilter,
  FilterToolbar,
  ActiveFilters,
  labelFrom,
} from "@/components/admin/FilterBar";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getOrdersPage, adminGetShops } from "@/lib/admin/queries";
import { orderFilters, filterQuery } from "@/lib/admin/filters";
import { BulkBar, BulkCheckbox } from "@/components/admin/BulkBar";
import { updateOrderStatus, bulkUpdateOrderStatus } from "@/lib/admin/order-actions";
import { isAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { orderItems } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Ties the row checkboxes to the bulk bar's form (see BulkBar). */
const BULK_FORM = "bulk-orders";

type SP = {
  searchParams: Promise<{
    negozio?: string;
    q?: string;
    stato?: string;
    tipo?: string;
    page?: string;
  }>;
};

const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "to-fulfil", label: "Da evadere" },
  { value: "paid", label: "Pagati" },
  { value: "fulfilled", label: "Evasi" },
  { value: "cancelled", label: "Annullati" },
  { value: "refunded", label: "Rimborsati" },
];

const FULFILMENT_CHIPS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti i tipi" },
  { value: "pickup", label: "Ritiro" },
  { value: "shipping", label: "Spedizione" },
];

const BASE = "/admin/orders";

export default async function AdminOrders({ searchParams }: SP) {
  const sp = await searchParams;
  const { negozio = "all", q, stato = "all", tipo = "all", page: pageStr } = sp;
  const page = Number(pageStr) || 1;
  const filters = orderFilters(sp);
  const [{ rows: orders, total, pageCount }, shops, admin] = await Promise.all([
    getOrdersPage({ ...filters, page }),
    adminGetShops(),
    isAdmin(),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

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
  const current = { negozio, stato, tipo, ...(q ? { q } : {}) };
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
              className="rounded-full bg-gold px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-gold-dark"
            >
              + Nuovo ordine
            </Link>
            {admin ? (
                <a
                href={`/api/admin/export/orders${filterQuery(filters)}`}
                download
                className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
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
      />

      <ActiveFilters
        basePath={BASE}
        params={current}
        labels={{
          stato: { title: "Stato", format: labelFrom(STATUS_CHIPS) },
          negozio: { title: "Sede", format: labelFrom(SHOP_CHIPS) },
          tipo: { title: "Consegna", format: labelFrom(FULFILMENT_CHIPS) },
          q: { title: "Ricerca", format: (v) => `“${v}”` },
        }}
      />

      {orders.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {q || stato !== "all" || tipo !== "all" || negozio !== "all"
              ? "Nessun ordine corrisponde ai filtri."
              : "Nessun ordine ancora. Gli ordini dallo shop online compaiono qui."}
          </p>
        </Panel>
      ) : (
        <>
        <BulkBar
          formId={BULK_FORM}
          action={bulkUpdateOrderStatus}
          label="ordini"
          options={[
            { value: "fulfilled", label: "Segna evasi" },
            { value: "pending", label: "Rimetti in attesa" },
            { value: "cancelled", label: "Annulla" },
          ]}
          confirm={(n) => `Applicare l'azione a ${n} ordini? I clienti riceveranno le email previste.`}
        />
        <div className="space-y-3">
          {orders.map((o) => {
            const prev = previewText(o.id);
            return (
              <Panel key={o.id} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-3">
                <BulkCheckbox formId={BULK_FORM} id={o.id} label={`Seleziona ordine ${o.orderNumber}`} />
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-brown-800/60">{o.orderNumber}</span>
                    <StatusBadge status={o.status} />
                    <StatusBadge status={o.paymentStatus} />
                  </div>
                  <p className="font-display text-lg text-brown-950">{o.name}</p>
                  <p className="text-xs text-brown-800/60">
                    {o.email} ·{" "}
                    {o.fulfilment === "shipping"
                      ? "Spedizione"
                      : `Ritiro${o.shopSlug ? ` · ${shopName.get(o.shopSlug) ?? o.shopSlug}` : ""}`}{" "}
                    · {fmtDate(o.createdAt)}
                  </p>
                  {prev && <p className="text-xs text-brown-800/50">{prev}</p>}
                </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-4">
                    <p className="font-display text-xl font-bold text-brown-950">{euro(o.totalCents)}</p>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                    >
                      Dettaglio
                    </Link>
                  </div>
                  {/* The overwhelmingly common next step for a paid pickup order
                      is "handed over" — make it one tap instead of two selects. */}
                  {o.status === "paid" && o.fulfilment === "pickup" && (
                    <ActionForm action={updateOrderStatus} className="inline-flex">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="status" value="fulfilled" />
                      <input type="hidden" name="paymentStatus" value={o.paymentStatus} />
                      <PendingButton tone="gold">✓ Consegnato</PendingButton>
                    </ActionForm>
                  )}
                  <ActionForm action={updateOrderStatus} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={o.id} />
                    <select name="status" defaultValue={o.status} className={`${inputCls} w-32`} aria-label="Stato ordine">
                      <option value="pending">In attesa</option>
                      <option value="paid">Pagato</option>
                      <option value="fulfilled">Evaso</option>
                      <option value="cancelled">Annullato</option>
                      {o.status === "refunded" && <option value="refunded">Rimborsato</option>}
                    </select>
                    <select name="paymentStatus" defaultValue={o.paymentStatus} className={`${inputCls} w-32`} aria-label="Stato pagamento">
                      <option value="unpaid">Da pagare</option>
                      <option value="paid">Pagato</option>
                      {o.paymentStatus === "refunded" && <option value="refunded">Rimborsato</option>}
                    </select>
                    <PendingButton tone="dark">Aggiorna</PendingButton>
                  </ActionForm>
                </div>
              </Panel>
            );
          })}
        </div>
        </>
      )}

      <Pagination basePath="/admin/orders" page={page} pageCount={pageCount} params={filters} />
    </div>
  );
}
