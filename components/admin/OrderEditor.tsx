"use client";

import { useState } from "react";
import { euro, inputCls, labelCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import {
  updateOrderDetails,
  updateOrderItems,
  setOrderFiscalIdentity,
} from "@/lib/admin/order-actions";
import { vatRateLabel } from "@/lib/fiscal";
import { FULFILMENT_MODES, FULFILMENT_LABEL } from "@/lib/fulfilment";
import type { OrderRow, OrderItemRow, ProductRow, ShopRow } from "@/lib/db/schema";

/**
 * Contact + delivery details of an existing order. Switching pickup ⇄ shipping
 * swaps which block of fields is relevant, so the operator only fills in the one
 * that applies; the server re-prices afterwards because the shipping fee moves.
 */
export function OrderDetailsForm({
  order,
  shops,
  slotOptions = [],
}: {
  order: OrderRow;
  shops: ShopRow[];
  /** Bookable windows, already filtered by cut-off and remaining capacity. */
  slotOptions?: { value: string; shopSlug: string; label: string }[];
}) {
  const [fulfilment, setFulfilment] = useState(order.fulfilment);
  const [shopSlug, setShopSlug] = useState(order.shopSlug ?? shops[0]?.slug ?? "");
  const addr = order.shippingAddress ?? {};
  const slotsForShop = slotOptions.filter((o) => o.shopSlug === shopSlug);

  return (
    <ActionForm action={updateOrderDetails} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={order.id} />

      <div>
        <label className={labelCls}>Nome</label>
        <input name="name" required maxLength={200} defaultValue={order.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Telefono</label>
        <input name="phone" maxLength={40} defaultValue={order.phone ?? ""} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls}>Email</label>
        <input name="email" type="email" maxLength={200} defaultValue={order.email} className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>Evasione</label>
        <select
          name="fulfilment"
          value={fulfilment}
          onChange={(e) => setFulfilment(e.target.value as typeof fulfilment)}
          className={inputCls}
        >
          {FULFILMENT_MODES.map((m) => (
            <option key={m} value={m}>
              {FULFILMENT_LABEL[m]}
            </option>
          ))}
        </select>
      </div>

      {fulfilment === "pickup" ? (
        <>
          <div>
            <label className={labelCls}>Negozio di ritiro</label>
            <select
              name="shopSlug"
              value={shopSlug}
              onChange={(e) => setShopSlug(e.target.value)}
              className={inputCls}
            >
              {shops.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {slotsForShop.length > 0 && (
            <div>
              <label className={labelCls}>Fascia di ritiro</label>
              {/* Blank keeps whatever window the customer already booked — an
                  edit to the phone number must not silently move their slot. */}
              <select name="pickupSlot" defaultValue="" className={inputCls}>
                <option value="">Lascia invariata</option>
                {slotsForShop.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <label className={labelCls}>CAP</label>
            <input name="zip" maxLength={20} defaultValue={addr.zip ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Indirizzo</label>
            <input name="address" maxLength={200} defaultValue={addr.address ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Città</label>
            <input name="city" maxLength={120} defaultValue={addr.city ?? ""} className={inputCls} />
          </div>
        </>
      )}

      <div className="sm:col-span-2">
        <label className={labelCls}>Note del cliente</label>
        <textarea name="notes" rows={2} defaultValue={order.notes ?? ""} className={inputCls} />
      </div>
      {/* Internal notes moved out of this form: they are the one field that
          stays editable after the money settles (see `setOrderInternalNotes`),
          and this form is blocked from that point. Two inputs for one column
          would have meant whichever was saved last silently won. */}

      <div className="sm:col-span-2">
        <PendingButton tone="dark">Salva dati ordine</PendingButton>
      </div>
    </ActionForm>
  );
}

/**
 * Buyer fiscal identity for the electronic invoice.
 *
 * Stays available after payment — a customer typically asks for the invoice once
 * they've already paid, and this changes no amounts.
 */
export function OrderFiscalForm({ order }: { order: OrderRow }) {
  return (
    <ActionForm action={setOrderFiscalIdentity} className="space-y-3">
      <input type="hidden" name="id" value={order.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Codice fiscale</label>
          <input
            name="customerTaxCode"
            maxLength={20}
            defaultValue={order.customerTaxCode ?? ""}
            placeholder="privati"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div>
          <label className={labelCls}>Partita IVA</label>
          <input
            name="customerVatNumber"
            maxLength={20}
            defaultValue={order.customerVatNumber ?? ""}
            placeholder="aziende"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div>
          <label className={labelCls}>Codice destinatario SdI</label>
          <input
            name="customerSdiCode"
            maxLength={10}
            defaultValue={order.customerSdiCode ?? ""}
            placeholder="7 caratteri"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div>
          <label className={labelCls}>PEC</label>
          <input
            name="customerPec"
            type="email"
            maxLength={200}
            defaultValue={order.customerPec ?? ""}
            className={inputCls}
          />
        </div>
      </div>
      <p className="text-xs text-brown-800/60">
        Senza codice destinatario si usa <code>0000000</code>: valido per i privati e per chi riceve
        via PEC o portale.
      </p>
      <PendingButton tone="dark">Salva dati fatturazione</PendingButton>
    </ActionForm>
  );
}

/**
 * Line editor for an unpaid order. Shows the lines already on the order first,
 * then lets the operator add any other sellable product. Setting a quantity to 0
 * removes the line. The running total is a preview — the server re-prices from
 * the catalogue and re-validates the coupon on save.
 */
export function OrderItemsForm({
  order,
  items,
  products,
}: {
  order: OrderRow;
  items: OrderItemRow[];
  products: ProductRow[];
}) {
  // Current quantity per product slug, keyed the same way the form posts.
  const initial: Record<string, number> = {};
  for (const i of items) if (i.productSlug) initial[i.productSlug] = i.quantity;
  const [qty, setQty] = useState<Record<string, number>>(initial);

  const sellable = products.filter((p) => p.active && p.priceCents != null);
  const onOrder = sellable.filter((p) => (initial[p.slug] ?? 0) > 0);
  const others = sellable.filter((p) => (initial[p.slug] ?? 0) === 0);

  const subtotal = sellable.reduce((sum, p) => sum + (p.priceCents ?? 0) * (qty[p.slug] ?? 0), 0);

  // Lines whose product is gone from the catalogue can't be re-posted, so the
  // operator is told rather than silently losing them on save.
  const orphaned = items.filter((i) => !i.productSlug || !sellable.some((p) => p.slug === i.productSlug));

  function Row({ p }: { p: ProductRow }) {
    return (
      <div className="flex items-center gap-4 py-2">
        <div className="flex-1">
          <p className="text-sm font-semibold text-brown-950">{p.name}</p>
          <p className="text-xs text-brown-800/60">
            {euro(p.priceCents)}
            {p.unit ? ` / ${p.unit}` : ""} · IVA {vatRateLabel(p.vatRateBps)}
            {p.stock != null ? ` · giacenza ${p.stock}` : ""}
          </p>
        </div>
        <input
          type="number"
          name={`qty_${p.slug}`}
          min={0}
          max={p.stock ?? undefined}
          value={qty[p.slug] ?? 0}
          onChange={(e) => setQty((q) => ({ ...q, [p.slug]: Math.max(0, Number(e.target.value) || 0) }))}
          className={`${inputCls} w-24`}
          aria-label={`Quantità ${p.name}`}
        />
      </div>
    );
  }

  return (
    <ActionForm action={updateOrderItems}>
      <input type="hidden" name="id" value={order.id} />

      {orphaned.length > 0 && (
        <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-soft-fg">
          {orphaned.length === 1 ? "Una riga fa" : `${orphaned.length} righe fanno`} riferimento a un
          prodotto non più a catalogo e verrà rimossa salvando:{" "}
          {orphaned.map((i) => i.name).join(", ")}.
        </p>
      )}

      {onOrder.length > 0 && (
        <div className="divide-y divide-brown-900/10">
          {onOrder.map((p) => (
            <Row key={p.id} p={p} />
          ))}
        </div>
      )}

      {others.length > 0 && (
        <details className="mt-4 border-t border-brown-900/10 pt-3">
          <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
            Aggiungi un prodotto ({others.length})
          </summary>
          <div className="mt-2 max-h-80 divide-y divide-brown-900/10 overflow-y-auto">
            {others.map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </div>
        </details>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-brown-900/10 pt-4">
        <p className="text-sm text-brown-800/70">
          Subtotale articoli:{" "}
          <strong className="font-display text-lg text-brown-950">{euro(subtotal)}</strong>
          <span className="ml-2 text-xs text-brown-800/50">
            spedizione e sconto ricalcolati al salvataggio
          </span>
        </p>
        <PendingButton tone="dark">Salva articoli</PendingButton>
      </div>
      <p className="mt-2 text-xs text-brown-800/60">
        Imposta 0 per togliere una riga. Prezzi e IVA sono sempre presi dall&apos;anagrafica prodotti.
      </p>
    </ActionForm>
  );
}
