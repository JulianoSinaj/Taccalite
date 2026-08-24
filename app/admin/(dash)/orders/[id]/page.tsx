import { notFound } from "next/navigation";
import Link from "next/link";
import { AdminHeader, Panel, StatusBadge, euro, fmtDate, inputCls, labelCls, BackLink } from "@/components/admin/ui";
import { ActionForm, PendingButton } from "@/components/admin/ActionForm";
import {
  adminGetOrder,
  adminGetShops,
  adminGetProducts,
  getReservationForOrder,
} from "@/lib/admin/queries";
import { OrderDetailsForm, OrderItemsForm, OrderFiscalForm } from "@/components/admin/OrderEditor";
import {
  updateOrderStatus,
  setOrderTracking,
  refundOrder,
  resendOrderEmail,
  settleOrderPayment,
} from "@/lib/admin/order-actions";
import { isAdmin } from "@/lib/auth/session";
import { getSetting } from "@/lib/db/queries";
import { orderVatBuckets, vatRateLabel } from "@/lib/fiscal";
import { getCarriers, trackingUrl } from "@/lib/carriers";
import { FULFILMENT_LABEL } from "@/lib/fulfilment";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_INSTRUMENT_LABEL,
  SETTLEMENT_INSTRUMENTS,
} from "@/lib/payments/methods";
import { formatSlotLabel } from "@/lib/pickup-slots";
import { getDeliveryZones, getPickupSlots, getPickupSlotCounts, getClosures } from "@/lib/db/queries";
import { pickupSlotOptions } from "@/lib/pickup-slots";
import { assertShopScope } from "@/lib/admin/scope";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, shops, admin, shippingVatPct, products, carriers, zones, slots, booked] =
    await Promise.all([
    adminGetOrder(id),

    adminGetShops(),
    isAdmin(),
    getSetting<number>("store.shippingVatRate", 22),
    adminGetProducts(),
    getCarriers(),
    getDeliveryZones(),
    getPickupSlots(),
    getPickupSlotCounts(),
  ]);
  if (!data) notFound();
  // A filtered list is not access control: without this, another location
  // 's record is one typed URL away. `notFound` rather than a message —
  // "it exists but is not yours" is itself information.
  await assertShopScope(data.order.shopSlug);
  // Only active zones are listed, so an order priced by a since-suspended zone
  // simply shows no zone rather than a stale name.
  const zone = zones.find((z) => z.id === data.order.deliveryZoneId) ?? null;
  const slotOptions = pickupSlotOptions(slots, {
    bookedCounts: booked,
    days: 14,
    // Rescheduling a pickup from here must not offer a day the shop is shut,
    // for the same reason checkout must not.
    closures: await getClosures(),
  }).map((o) => ({
    value: o.value,
    shopSlug: o.shopSlug,
    label: o.label,
  }));
  const { order, items } = data;
  // The booking this sale came from, when it came from one.
  const fromReservation = await getReservationForOrder(order.reservationId);
  // An order's lines and totals are frozen once the money is settled — the
  // customer was charged a specific amount. Corrections then go through a refund.
  const editable = order.paymentStatus === "unpaid" && order.status !== "cancelled";
  const shopName = order.shopSlug ? shops.find((s) => s.slug === order.shopSlug)?.name ?? order.shopSlug : null;
  const addr = order.shippingAddress;
  const trackingHref = trackingUrl(carriers, order.carrier, order.trackingNumber);
  const refundableCents = order.totalCents - order.refundedCents;
  // Money still owed on an order that was never charged online. Staff can take
  // it, not just admins — collecting at the counter is the job.
  const canSettle = order.paymentStatus === "unpaid" && order.status !== "cancelled";
  const canRefund =
    admin && order.paymentStatus === "paid" && order.status !== "refunded" && refundableCents > 0;
  // IVA breakdown reconciled with the money actually kept: line grosses net of
  // the apportioned discount, plus shipping at its configured rate, minus any
  // refund apportioned across those same buckets (prices are VAT-inclusive). So
  // the table below re-sums to "Incassato netto", not to the original total.
  const vat = orderVatBuckets({
    items: items.map((i) => ({ grossCents: i.lineTotalCents, vatRateBps: i.vatRateBps })),
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    shippingVatBps: Math.round(shippingVatPct * 100),
    refundedCents: order.refundedCents,
  });

  return (
    <div>
      <AdminHeader
        title={`Ordine ${order.orderNumber}`}
        subtitle={fmtDate(order.createdAt)}
        action={
          <Link
            href={`/admin/orders/${order.id}/packing-slip`}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-950 px-4 py-2 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900"
          >
            Documento di consegna
          </Link>
        }
      />
      <BackLink href="/admin/orders">Ordini</BackLink>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <h3 className="font-display mb-4 text-lg text-brown-950">Articoli</h3>
            <div className="divide-y divide-brown-900/10">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between gap-3 py-2 text-sm">
                  <span className="text-brown-900/80">
                    {/* A weight line reads "0,350 kg × …/kg", not "1×". */}
                    {i.weightKg != null
                      ? `${i.weightKg.toLocaleString("it-IT", { maximumFractionDigits: 3 })} kg`
                      : `${i.quantity}×`}{" "}
                    {i.name}
                    <span className="ml-1.5 text-xs text-brown-800/50">
                      {euro(i.unitPriceCents)}
                      {i.weightKg != null ? "/kg" : ""}
                    </span>
                    {i.priceOverridden && (
                      <span className="ml-1.5 rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-warn-soft-fg uppercase">
                        prezzo concordato
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-brown-950">{euro(i.lineTotalCents)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1 border-t border-brown-900/10 pt-4 text-sm">
              <div className="flex justify-between text-brown-800/70">
                <span>Subtotale</span>
                <span>{euro(order.subtotalCents)}</span>
              </div>
              {order.discountCents > 0 && (
                <div className="flex justify-between text-ok">
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
              {order.refundedCents > 0 && (
                <>
                  <div className="flex justify-between pt-1 text-danger">
                    <span>Rimborsato</span>
                    <span>−{euro(order.refundedCents)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-brown-950">
                    <span>Incassato netto</span>
                    <span>{euro(order.totalCents - order.refundedCents)}</span>
                  </div>
                </>
              )}
            </div>
            {vat.length > 0 && (
              <div className="mt-4 border-t border-brown-900/10 pt-3">
                <p className="mb-2 text-[12px] font-bold tracking-widest text-brown-800/60 uppercase">
                  Riepilogo IVA (prezzi ivati)
                  {order.refundedCents > 0 ? " · al netto del rimborso" : ""}
                </p>
                <div className="scroll-x">
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
              </div>
            )}
          </Panel>

          {editable && (
            <Panel>
              <h3 className="font-display mb-1 text-lg text-brown-950">Modifica articoli</h3>
              <p className="mb-4 text-xs text-brown-800/60">
                Disponibile finché l&apos;ordine non è pagato.
              </p>
              <OrderItemsForm order={order} items={items} products={products} />
            </Panel>
          )}

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
                  {FULFILMENT_LABEL[order.fulfilment]}
                  {shopName ? ` · ${shopName}` : ""}
                </dd>
              </div>
              {order.pickupSlotAt && (
                <div>
                  <dt className="text-brown-800/60">Fascia di ritiro</dt>
                  <dd className="text-brown-950">{formatSlotLabel(order.pickupSlotAt)}</dd>
                </div>
              )}
              {zone && (
                <div>
                  <dt className="text-brown-800/60">Zona</dt>
                  <dd className="text-brown-950">{zone.name}</dd>
                </div>
              )}
            </dl>
            {order.fulfilment !== "pickup" && addr && (
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
            {/* The booking links forward to the order it became; this is the
                way back, which was missing — so an order converted from a
                phone booking looked like any counter sale, and the notes the
                customer actually gave were unreachable from here. */}
            {fromReservation && (
              <p className="mt-3 text-sm">
                <Link
                  href={`/admin/reservations/${fromReservation.id}`}
                  className="font-bold text-brown-800 underline decoration-gold-dark/60 underline-offset-2 hover:text-brown-950"
                >
                  Nato dalla prenotazione {fromReservation.reference} ({fromReservation.date}
                  {fromReservation.time ? ` ${fromReservation.time}` : ""}) →
                </Link>
              </p>
            )}
            {order.notes && (
              <p className="mt-3 text-sm text-brown-800/70">
                <span aria-hidden="true">📝</span> <span className="sr-only">Note: </span>
                {order.notes}
              </p>
            )}
            {order.internalNotes && (
              <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-sm text-brown-900">
                <span className="text-[11px] font-bold tracking-widest text-brown-800/60 uppercase">
                  Nota interna
                </span>
                <br />
                {order.internalNotes}
              </p>
            )}

            {editable ? (
              <details className="mt-4 border-t border-brown-900/10 pt-3">
                <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
                  Modifica dati e consegna
                </summary>
                <div className="mt-4">
                  <OrderDetailsForm order={order} shops={shops} slotOptions={slotOptions} />
                </div>
              </details>
            ) : (
              <p className="mt-4 border-t border-brown-900/10 pt-3 text-xs text-brown-800/60">
                Ordine {order.status === "cancelled" ? "annullato" : "già pagato"}: articoli e dati non
                sono modificabili.{" "}
                {order.status !== "cancelled" &&
                  "Per correggerlo usa «Rimborsa» e registra un nuovo ordine."}
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
                {/* "Pagato" is not offered while the order is unpaid: settling
                    goes through "Registra incasso" above, which is the only
                    path that records what the money arrived on. Still listed
                    once it IS paid, so the state can be read back. */}
                <select name="status" defaultValue={order.status} className={inputCls}>
                  <option value="pending">In attesa</option>
                  {!canSettle && <option value="paid">Pagato</option>}
                  <option value="fulfilled">Evaso</option>
                  <option value="cancelled">Annullato</option>
                  {order.status === "refunded" && <option value="refunded">Rimborsato</option>}
                </select>
              </div>
              <div>
                <label className={labelCls}>Stato pagamento</label>
                <select name="paymentStatus" defaultValue={order.paymentStatus} className={inputCls}>
                  <option value="unpaid">Da pagare</option>
                  {!canSettle && <option value="paid">Pagato</option>}
                  {order.paymentStatus === "refunded" && <option value="refunded">Rimborsato</option>}
                </select>
              </div>
              <PendingButton tone="dark">Aggiorna ordine</PendingButton>
            </ActionForm>

            {order.email && (
              <div className="mt-4 border-t border-brown-900/10 pt-4">
                <ActionForm action={resendOrderEmail}>
                  <input type="hidden" name="id" value={order.id} />
                  <PendingButton tone="dark">Reinvia email al cliente</PendingButton>
                </ActionForm>
                <p className="mt-2 text-xs text-brown-800/60">
                  Rimanda l&apos;ultima comunicazione utile ({order.status === "fulfilled"
                    ? "avviso di evasione"
                    : order.status === "cancelled"
                      ? "avviso di annullamento"
                      : "conferma d'ordine"}
                  ) a {order.email}.
                </p>
              </div>
            )}
          </Panel>

          {order.fulfilment === "shipping" && (
            <Panel>
              <h3 className="font-display mb-3 text-lg text-brown-950">Spedizione</h3>
              <ActionForm action={setOrderTracking} className="space-y-3">
                <input type="hidden" name="id" value={order.id} />
                <div>
                  <label className={labelCls}>Corriere</label>
                  {/* A suggestion list, not a closed select: the couriers come
                      from a setting, and a one-off shipment must not be blocked
                      by a name nobody has added yet. Typing "brt" still matches
                      the preset's tracking URL — the lookup is case-insensitive. */}
                  <input
                    name="carrier"
                    list="order-carriers"
                    defaultValue={order.carrier ?? ""}
                    placeholder="es. BRT, GLS, Poste"
                    className={inputCls}
                  />
                  <datalist id="order-carriers">
                    {carriers.map((c) => (
                      <option key={c.name} value={c.name} />
                    ))}
                  </datalist>
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
                {trackingHref && (
                  <p className="text-xs">
                    <a
                      href={trackingHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-gold-deep underline"
                    >
                      Apri il tracking sul sito del corriere ↗
                    </a>
                  </p>
                )}
                <p className="text-xs text-brown-800/60">
                  Se l&apos;ordine è già evaso, salvando il tracking l&apos;email di spedizione viene reinviata al cliente.
                </p>
                <PendingButton tone="dark">Salva tracking</PendingButton>
              </ActionForm>
            </Panel>
          )}

          <Panel>
            <h3 className="font-display mb-3 text-lg text-brown-950">Pagamento</h3>

            {/* The whole point of the offline cycle: an order that was never
                charged online is closed here, and the instrument is asked for
                rather than assumed — contanti is MP01 on the fattura, POS is
                MP08, and nothing downstream can work out which it was. */}
            {canSettle && (
              <div className="mb-4 border border-gold-dark/40 bg-gold/10 p-4">
                <p className="font-display text-base text-brown-950">
                  Da incassare: {euro(order.totalCents - order.refundedCents)}
                </p>
                <p className="mt-1 mb-3 text-xs text-brown-800/60">
                  {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                  {order.paymentMethod === "card"
                    ? " — il pagamento online non è stato completato."
                    : "."}
                </p>
                <ActionForm action={settleOrderPayment} className="space-y-3">
                  <input type="hidden" name="id" value={order.id} />
                  <div>
                    <label className={labelCls} htmlFor="settle-with">
                      Incassato con
                    </label>
                    <select id="settle-with" name="paidWith" defaultValue="cash" className={inputCls}>
                      {SETTLEMENT_INSTRUMENTS.map((i) => (
                        <option key={i} value={i}>
                          {PAYMENT_INSTRUMENT_LABEL[i]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <PendingButton tone="dark">Registra incasso</PendingButton>
                </ActionForm>
                <p className="mt-2 text-xs text-brown-800/60">
                  Registra il pagamento, accredita i punti fedeltà e conta l&apos;eventuale codice
                  sconto. La giacenza è già stata scalata quando l&apos;ordine è stato accettato.
                </p>
              </div>
            )}

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-brown-800/60">Metodo</dt>
                <dd className="text-brown-950">{PAYMENT_METHOD_LABEL[order.paymentMethod]}</dd>
              </div>
              {order.paidWith && (
                <div className="flex justify-between gap-3">
                  <dt className="text-brown-800/60">Incassato con</dt>
                  <dd className="text-brown-950">{PAYMENT_INSTRUMENT_LABEL[order.paidWith]}</dd>
                </div>
              )}
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
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/api/admin/invoice/${order.id}/xml`}
                    download
                    className="inline-block inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-4 py-2 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
                  >
                    Fattura XML (SdI)
                  </a>
                  {order.refundedCents > 0 && (
                    <a
                      href={`/api/admin/invoice/${order.id}/xml?doc=nota-credito`}
                      download
                      className="inline-block inline-flex min-h-11 items-center justify-center rounded-full bg-danger-soft px-4 py-2 text-xs font-bold tracking-widest text-danger-soft-fg uppercase hover:bg-danger-soft"
                    >
                      Nota di credito
                    </a>
                  )}
                </div>
                <p className="mt-2 text-xs text-brown-800/60">
                  Formato FatturaPA FPR12, da trasmettere tramite un intermediario accreditato.
                  {order.refundedCents > 0 &&
                    " La nota di credito (TD04) storna i " +
                      (order.refundedCents / 100).toFixed(2) +
                      " € rimborsati."}
                </p>

                <details className="mt-4" open={!order.customerTaxCode && !order.customerVatNumber}>
                  <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
                    Dati di fatturazione
                  </summary>
                  <div className="mt-3">
                    <OrderFiscalForm order={order} />
                  </div>
                </details>
              </div>
            )}
            {canRefund && (
              <div className="mt-4 border-t border-brown-900/10 pt-4">
                <ActionForm action={refundOrder} className="flex flex-col items-start gap-2">
                  <input type="hidden" name="id" value={order.id} />
                  <label className={labelCls} htmlFor="importoEuros">
                    Importo da rimborsare (€)
                  </label>
                  <input
                    id="importoEuros"
                    name="importoEuros"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={(refundableCents / 100).toFixed(2)}
                    placeholder={`${(refundableCents / 100).toFixed(2)} (tutto)`}
                    className={`${inputCls} max-w-[12rem]`}
                  />
                  <p className="text-xs text-brown-800/60">
                    {order.refundedCents > 0
                      ? `Già rimborsato ${euro(order.refundedCents)} · residuo ${euro(refundableCents)}.`
                      : "Lascia vuoto per rimborsare l'intero importo."}{" "}
                    Le scorte rientrano e il coupon si libera solo al rimborso totale.
                  </p>
                  <PendingButton
                    tone="danger"
                    confirm={`Confermi il rimborso per l'ordine ${order.orderNumber}? L'operazione non è reversibile.`}
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
