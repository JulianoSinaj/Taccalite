import Link from "next/link";
import { inArray } from "drizzle-orm";
import { AdminHeader, Panel, StatusBadge, euro, fmtDate, inputCls, SearchBox, Pagination } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { getOrdersPage, adminGetShops } from "@/lib/admin/queries";
import { updateOrderStatus } from "@/lib/admin/order-actions";
import { isAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { orderItems } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

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

const chipCls = (active: boolean) =>
  `rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase ${
    active ? "bg-gold text-brown-950" : "bg-brown-900/10 text-brown-800 hover:bg-brown-900/15"
  }`;

export default async function AdminOrders({ searchParams }: SP) {
  const { negozio = "all", q, stato = "all", tipo = "all", page: pageStr } = await searchParams;
  const page = Number(pageStr) || 1;
  const [{ rows: orders, total, pageCount }, shops, admin] = await Promise.all([
    getOrdersPage({ shopSlug: negozio, q, status: stato, fulfilment: tipo, page }),
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

  // Preserve the active filters/search on chip links (dropping page).
  const filterHref = (patch: Record<string, string>) => {
    const sp = new URLSearchParams();
    const base: Record<string, string> = { negozio, stato, tipo, ...(q ? { q } : {}), ...patch };
    for (const [k, v] of Object.entries(base)) if (v && v !== "all") sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

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
              // eslint-disable-next-line @next/next/no-html-link-for-pages -- API download route, not a page
              <a
                href="/api/admin/export/orders"
                download
                className="rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                Esporta CSV
              </a>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href={filterHref({ negozio: "all" })} className={chipCls(negozio === "all")}>
          Tutte le sedi
        </Link>
        {shops.map((s) => (
          <Link key={s.slug} href={filterHref({ negozio: s.slug })} className={chipCls(negozio === s.slug)}>
            {s.name}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <Link key={c.value} href={filterHref({ stato: c.value })} className={chipCls(stato === c.value)}>
            {c.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {FULFILMENT_CHIPS.map((c) => (
          <Link key={c.value} href={filterHref({ tipo: c.value })} className={chipCls(tipo === c.value)}>
            {c.label}
          </Link>
        ))}
      </div>

      <SearchBox
        basePath="/admin/orders"
        q={q}
        placeholder="Cerca per numero, nome, email…"
        hidden={{ negozio, stato, tipo }}
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
        <div className="space-y-3">
          {orders.map((o) => {
            const prev = previewText(o.id);
            return (
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
                  {prev && <p className="text-xs text-brown-800/50">{prev}</p>}
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
            );
          })}
        </div>
      )}

      <Pagination
        basePath="/admin/orders"
        page={page}
        pageCount={pageCount}
        params={{ negozio, q, stato, tipo }}
      />
    </div>
  );
}
