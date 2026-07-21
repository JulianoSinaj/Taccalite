import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, euro, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import { adminGetOrder, adminGetShops } from "@/lib/admin/queries";
import { updateOrderStatus, setOrderTracking, refundOrder } from "@/lib/admin/order-actions";
import { isAdmin } from "@/lib/auth/session";
import { vatBreakdown, vatRateLabel } from "@/lib/fiscal";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, shops, admin] = await Promise.all([adminGetOrder(id), adminGetShops(), isAdmin()]);
  if (!data) notFound();
  const { order, items } = data;
  const shopName = order.shopSlug ? shops.find((s) => s.slug === order.shopSlug)?.name ?? order.shopSlug : null;
  const addr = order.shippingAddress;
  const canRefund = admin && order.paymentStatus === "paid" && order.status !== "refunded";
  // IVA breakdown from the per-line snapshot rates (prices are VAT-inclusive).
  const vat = vatBreakdown(items.map((i) => ({ grossCents: i.lineTotalCents, vatRateBps: i.vatRateBps })));

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
              {order.discountCents > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Sconto{order.discountCode ? ` (${order.discountCode})` : ""}</span>
                  <span>−{euro(order.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-brown-800/70">
                <span>Spedizione</span>
                <span>{euro(order.shippingCents)}</span>
              </div>
              <div className="flex justify-between font-display text-lg font-bold text-brown-950">
                <span>Totale</span>
                <span>{euro(order.totalCents)}</span>
              </div>
            </div>
            {vat.length > 0 && (
              <div className="mt-4 border-t border-brown-900/10 pt-3">
                <p className="mb-2 text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
                  Riepilogo IVA (prezzi ivati)
                </p>
                <table className="w-full text-xs text-brown-800/80">
                  <thead>
                    <tr className="text-left text-brown-800/50">
                      <th className="pb-1 font-semibold">Aliquota</th>
                      <th className="pb-1 text-right font-semibold">Imponibile</th>
                      <th className="pb-1 text-right font-semibold">Imposta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vat.map((b) => (
                      <tr key={b.rateBps}>
                        <td className="py-0.5">{vatRateLabel(b.rateBps)}</td>
                        <td className="py-0.5 text-right">{euro(b.imponibileCents)}</td>
                        <td className="py-0.5 text-right">{euro(b.impostaCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
            {order.userId && (
              <p className="mt-3 text-sm">
                <Link
                  href={`/admin/loyalty/${order.userId}`}
                  className="font-bold text-brown-800 underline decoration-gold-dark/60 underline-offset-2 hover:text-brown-950"
                >
                  Scheda cliente e punti fedeltà →
                </Link>
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
                <label className={labelCls}>Stato ordine</label>
                <select name="status" defaultValue={order.status} className={inputCls}>
                  <option value="pending">In attesa</option>
                  <option value="paid">Pagato</option>
                  <option value="fulfilled">Evaso</option>
                  <option value="cancelled">Annullato</option>
                  <option value="refunded">Rimborsato</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Stato pagamento</label>
                <select name="paymentStatus" defaultValue={order.paymentStatus} className={inputCls}>
                  <option value="unpaid">Da pagare</option>
                  <option value="paid">Pagato</option>
                  <option value="refunded">Rimborsato</option>
                </select>
              </div>
              <PendingButton tone="dark">Aggiorna ordine</PendingButton>
            </ActionForm>
          </Panel>

          {order.fulfilment === "shipping" && (
            <Panel>
              <h3 className="font-display mb-3 text-lg text-brown-950">Spedizione</h3>
              <ActionForm action={setOrderTracking} className="space-y-3">
                <input type="hidden" name="id" value={order.id} />
                <div>
                  <label className={labelCls}>Corriere</label>
                  <input
                    name="carrier"
                    defaultValue={order.carrier ?? ""}
                    placeholder="es. BRT, GLS, Poste"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Numero di tracking</label>
                  <input
                    name="trackingNumber"
                    defaultValue={order.trackingNumber ?? ""}
                    placeholder="Codice di spedizione"
                    className={inputCls}
                  />
                </div>
                <p className="text-xs text-brown-800/60">
                  Se l&apos;ordine è già evaso, salvando il tracking l&apos;email di spedizione viene reinviata al cliente.
                </p>
                <PendingButton tone="dark">Salva tracking</PendingButton>
              </ActionForm>
            </Panel>
          )}

          <Panel>
            <h3 className="font-display mb-3 text-lg text-brown-950">Pagamento</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-brown-800/60">Provider</dt>
                <dd className="text-brown-950">{order.paymentProvider ?? "—"}</dd>
              </div>
              {order.stripeSessionId && (
                <div className="flex justify-between gap-3">
                  <dt className="text-brown-800/60">Sessione Stripe</dt>
                  <dd className="max-w-[60%] truncate font-mono text-xs text-brown-950" title={order.stripeSessionId}>
                    {order.stripeSessionId}
                  </dd>
                </div>
              )}
            </dl>
            {admin && (
              <div className="mt-4 border-t border-brown-900/10 pt-4">
                <a
                  href={`/api/admin/invoice/${order.id}/xml`}
                  download
                  className="inline-block rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                >
                  Fattura XML (SdI)
                </a>
                <p className="mt-2 text-xs text-brown-800/60">
                  Formato FatturaPA FPR12, da trasmettere tramite un intermediario accreditato.
                </p>
              </div>
            )}
            {canRefund && (
              <div className="mt-4 border-t border-brown-900/10 pt-4">
                <ActionForm action={refundOrder} className="flex flex-col items-start gap-2">
                  <input type="hidden" name="id" value={order.id} />
                  <PendingButton
                    tone="danger"
                    confirm={`Confermi il rimborso di ${euro(order.totalCents)} per l'ordine ${order.orderNumber}? L'operazione non è reversibile.`}
                  >
                    Rimborsa
                  </PendingButton>
                </ActionForm>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
