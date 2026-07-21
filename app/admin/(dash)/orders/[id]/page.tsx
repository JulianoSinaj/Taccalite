import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, euro, fmtDate, inputCls } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetOrder, adminGetShops } from "@/lib/admin/queries";
import { updateOrderStatus } from "@/lib/admin/order-actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, shops] = await Promise.all([adminGetOrder(id), adminGetShops()]);
  if (!data) notFound();
  const { order, items } = data;
  const shopName = order.shopSlug ? shops.find((s) => s.slug === order.shopSlug)?.name ?? order.shopSlug : null;
  const addr = order.shippingAddress;

  return (
    <div>
      <AdminHeader title={`Ordine ${order.orderNumber}`} subtitle={fmtDate(order.createdAt)} />
      <Link href="/admin/orders" className="mb-4 inline-block text-sm text-brown-800/70 hover:text-brown-950">
        ← Torna agli ordini
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <h3 className="font-display mb-4 text-lg text-brown-950">Articoli</h3>
            <div className="divide-y divide-brown-900/10">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between py-2 text-sm">
                  <span className="text-brown-900/80">
                    {i.quantity}× {i.name}
                  </span>
                  <span className="font-medium text-brown-950">{euro(i.lineTotalCents)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1 border-t border-brown-900/10 pt-4 text-sm">
              <div className="flex justify-between text-brown-800/70">
                <span>Subtotale</span>
                <span>{euro(order.subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-brown-800/70">
                <span>Spedizione</span>
                <span>{euro(order.shippingCents)}</span>
              </div>
              <div className="flex justify-between font-display text-lg font-bold text-brown-950">
                <span>Totale</span>
                <span>{euro(order.totalCents)}</span>
              </div>
            </div>
          </Panel>

          <Panel>
            <h3 className="font-display mb-3 text-lg text-brown-950">Cliente</h3>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-brown-800/60">Nome</dt>
                <dd className="text-brown-950">{order.name}</dd>
              </div>
              <div>
                <dt className="text-brown-800/60">Email</dt>
                <dd className="text-brown-950">{order.email}</dd>
              </div>
              {order.phone && (
                <div>
                  <dt className="text-brown-800/60">Telefono</dt>
                  <dd className="text-brown-950">{order.phone}</dd>
                </div>
              )}
              <div>
                <dt className="text-brown-800/60">Evasione</dt>
                <dd className="text-brown-950">
                  {order.fulfilment === "shipping"
                    ? "Spedizione"
                    : `Ritiro${shopName ? ` · ${shopName}` : ""}`}
                </dd>
              </div>
            </dl>
            {order.fulfilment === "shipping" && addr && (
              <p className="mt-3 text-sm text-brown-800/80">
                {addr.address}, {addr.zip} {addr.city}
              </p>
            )}
            {order.notes && (
              <p className="mt-3 text-sm text-brown-800/70">
                <span aria-hidden="true">📝</span> <span className="sr-only">Note: </span>
                {order.notes}
              </p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <h3 className="font-display mb-3 text-lg text-brown-950">Stato</h3>
            <div className="mb-4 flex flex-wrap gap-2">
              <StatusBadge status={order.status} />
              <StatusBadge status={order.paymentStatus} />
            </div>
            <ActionForm action={updateOrderStatus} className="space-y-3">
              <input type="hidden" name="id" value={order.id} />
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-brown-800/60">
                  Stato ordine
                </label>
                <select name="status" defaultValue={order.status} className={inputCls}>
                  <option value="pending">In attesa</option>
                  <option value="paid">Pagato</option>
                  <option value="fulfilled">Evaso</option>
                  <option value="cancelled">Annullato</option>
                  <option value="refunded">Rimborsato</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-brown-800/60">
                  Stato pagamento
                </label>
                <select name="paymentStatus" defaultValue={order.paymentStatus} className={inputCls}>
                  <option value="unpaid">Da pagare</option>
                  <option value="paid">Pagato</option>
                  <option value="refunded">Rimborsato</option>
                </select>
              </div>
              <PendingButton tone="dark">Aggiorna ordine</PendingButton>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </div>
  );
}
