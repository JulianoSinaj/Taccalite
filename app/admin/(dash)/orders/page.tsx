import { AdminHeader, Panel, StatusBadge, euro, fmtDate } from "@/components/admin/ui";
import { getOrdersList } from "@/lib/admin/queries";
import { updateOrderStatus } from "@/lib/admin/order-actions";
import { inputCls, SubmitButton } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

export default async function AdminOrders() {
  const orders = await getOrdersList();

  return (
    <div>
      <AdminHeader title="Ordini" subtitle={`${orders.length} ordini`} />
      {orders.length === 0 ? (
        <Panel>
          <p className="text-brown-800/70">
            Nessun ordine ancora. Gli ordini dallo shop online compaiono qui.
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
                  {o.email} · {o.fulfilment === "shipping" ? "Spedizione" : "Ritiro"} · {fmtDate(o.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="font-display text-xl font-bold text-brown-950">{euro(o.totalCents)}</p>
                <form action={updateOrderStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={o.id} />
                  <select name="status" defaultValue={o.status} className={`${inputCls} w-36`}>
                    <option value="pending">In attesa</option>
                    <option value="paid">Pagato</option>
                    <option value="fulfilled">Evaso</option>
                    <option value="cancelled">Annullato</option>
                    <option value="refunded">Rimborsato</option>
                  </select>
                  <SubmitButton tone="dark">Aggiorna</SubmitButton>
                </form>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
