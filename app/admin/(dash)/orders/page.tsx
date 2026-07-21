import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, euro, fmtDate, inputCls, SearchBox, Pagination } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getOrdersPage, adminGetShops } from "@/lib/admin/queries";
import { updateOrderStatus } from "@/lib/admin/order-actions";

export const dynamic = "force-dynamic";

type SP = { searchParams: Promise<{ negozio?: string; q?: string; page?: string }> };

export default async function AdminOrders({ searchParams }: SP) {
  const { negozio = "all", q, page: pageStr } = await searchParams;
  const page = Number(pageStr) || 1;
  const [{ rows: orders, total, pageCount }, shops] = await Promise.all([
    getOrdersPage({ shopSlug: negozio, q, page }),
    adminGetShops(),
  ]);
  const shopName = new Map(shops.map((s) => [s.slug, s.name]));

  return (
    <div>
      <AdminHeader
        title="Ordini"
        subtitle={`${total} ordini`}
        action={
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- API download route, not a page
          <a
            href="/api/admin/export/orders"
            download
            className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
          >
            Esporta CSV
          </a>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/orders?negozio=all"
          className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
            negozio === "all" ? "bg-gold text-brown-950" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
          }`}
        >
          Tutte le sedi
        </Link>
        {shops.map((s) => (
          <Link
            key={s.slug}
            href={`/admin/orders?negozio=${s.slug}`}
            className={`rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
              negozio === s.slug ? "bg-gold text-brown-950" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
            }`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <SearchBox basePath="/admin/orders" q={q} placeholder="Cerca per numero, nome, email…" hidden={{ negozio }} />

      {orders.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            {q ? "Nessun ordine corrisponde alla ricerca." : "Nessun ordine ancora. Gli ordini dallo shop online compaiono qui."}
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Panel key={o.id} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                <ActionForm action={updateOrderStatus} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={o.id} />
                  <select name="status" defaultValue={o.status} className={`${inputCls} w-32`}>
                    <option value="pending">In attesa</option>
                    <option value="paid">Pagato</option>
                    <option value="fulfilled">Evaso</option>
                    <option value="cancelled">Annullato</option>
                    <option value="refunded">Rimborsato</option>
                  </select>
                  <select name="paymentStatus" defaultValue={o.paymentStatus} className={`${inputCls} w-32`}>
                    <option value="unpaid">Da pagare</option>
                    <option value="paid">Pagato</option>
                    <option value="refunded">Rimborsato</option>
                  </select>
                  <PendingButton tone="dark">Aggiorna</PendingButton>
                </ActionForm>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Pagination basePath="/admin/orders" page={page} pageCount={pageCount} params={{ negozio, q }} />
    </div>
  );
}
