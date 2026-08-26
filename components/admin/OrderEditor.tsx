"use client";

import { useState } from "react";
import { useFieldIds } from "@/components/admin/forms";
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
  const fid = useFieldIds();
  const [fulfilment, setFulfilment] = useState(order.fulfilment);
  const [shopSlug, setShopSlug] = useState(order.shopSlug ?? shops[0]?.slug ?? "");
  const addr = order.shippingAddress ?? {};
  const slotsForShop = slotOptions.filter((o) => o.shopSlug === shopSlug);

  return (
    <ActionForm action={updateOrderDetails} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={order.id} />

      <div>
        <label className={labelCls} htmlFor={fid("name")}>Nome</label>
        <input id={fid("name")} name="name" required maxLength={200} defaultValue={order.name} className={inputCls} />
      </div>
      <div>
        <label className={labelCls} htmlFor={fid("phone")}>Telefono</label>
        <input id={fid("phone")} name="phone" maxLength={40} defaultValue={order.phone ?? ""} className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("email")}>Email</label>
        <input id={fid("email")} name="email" type="email" maxLength={200} defaultValue={order.email} className={inputCls} />
      </div>

      <div>
        <label className={labelCls} htmlFor={fid("fulfilment")}>Evasione</label>
        <select
          id={fid("fulfilment")}
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
            <label className={labelCls} htmlFor={fid("shopSlug")}>Negozio di ritiro</label>
            <select
              id={fid("shopSlug")}
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
              <label className={labelCls} htmlFor={fid("pickupSlot")}>Fascia di ritiro</label>
              {/* Blank keeps whatever window the customer already booked — an
                  edit to the phone number must not silently move their slot. */}
              <select id={fid("pickupSlot")} name="pickupSlot" defaultValue="" className={inputCls}>
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
            <label className={labelCls} htmlFor={fid("zip")}>CAP</label>
            <input id={fid("zip")} name="zip" maxLength={20} defaultValue={addr.zip ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor={fid("address")}>Indirizzo</label>
            <input id={fid("address")} name="address" maxLength={200} defaultValue={addr.address ?? ""} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor={fid("city")}>Città</label>
            <input id={fid("city")} name="city" maxLength={120} defaultValue={addr.city ?? ""} className={inputCls} />
          </div>
        </>
      )}

      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={fid("notes")}>Note del cliente</label>
        <textarea id={fid("notes")} name="notes" rows={2} defaultValue={order.notes ?? ""} className={inputCls} />
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
  const fid = useFieldIds();
  return (
    <ActionForm action={setOrderFiscalIdentity} className="space-y-3">
      <input type="hidden" name="id" value={order.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor={fid("customerTaxCode")}>Codice fiscale</label>
          <input
            id={fid("customerTaxCode")}
            name="customerTaxCode"
            maxLength={20}
            defaultValue={order.customerTaxCode ?? ""}
            placeholder="privati"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("customerVatNumber")}>Partita IVA</label>
          <input
            id={fid("customerVatNumber")}
            name="customerVatNumber"
            maxLength={20}
            defaultValue={order.customerVatNumber ?? ""}
            placeholder="aziende"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("customerSdiCode")}>Codice destinatario SdI</label>
          <input
            id={fid("customerSdiCode")}
            name="customerSdiCode"
            maxLength={10}
            defaultValue={order.customerSdiCode ?? ""}
            placeholder="7 caratteri"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("customerPec")}>PEC</label>
          <input
            id={fid("customerPec")}
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
 * Line and price editor for an unpaid order.
 *
 * Posts the same three field families as the counter form — `qty_<slug>` for a
 * product sold by the piece, `kg_<slug>` for one priced per kg, `price_<slug>`
 * for a negotiated price — plus the coupon, the negotiated reduction and the
 * carriage override. It used to post quantities only, so a "0,350 kg" line came
 * back as "1 × listino" and a negotiated price snapped back to the catalogue on
 * the first save. The running total is a preview — the server re-prices from
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
  const fid = useFieldIds();
  type Entry = { amount: number; priceCents?: number };

  const sellable = products.filter((p) => p.active && p.priceCents != null);
  const bySlug = new Map(sellable.map((p) => [p.slug, p]));

  // What the order holds today, keyed the way the form posts. A line already
  // weighed stays a weight line whatever the catalogue flag says now; a new
  // line follows the product.
  const initial: Record<string, Entry> = {};
  const weighed = new Set<string>();
  for (const i of items) {
    if (!i.productSlug || !bySlug.has(i.productSlug)) continue;
    initial[i.productSlug] = {
      amount: i.weightKg ?? i.quantity,
      priceCents: i.priceOverridden ? i.unitPriceCents : undefined,
    };
    if (i.weightKg != null) weighed.add(i.productSlug);
  }
  const byWeight = (p: ProductRow) => weighed.has(p.slug) || p.soldByWeight;

  const [cart, setCart] = useState<Record<string, Entry>>(initial);
  const [search, setSearch] = useState("");
  const [manualDiscount, setManualDiscount] = useState(
    order.manualDiscountCents > 0 ? (order.manualDiscountCents / 100).toFixed(2) : "",
  );

  // Lines whose product is gone from the catalogue can't be re-posted, so the
  // operator is told rather than silently losing them on save.
  const orphaned = items.filter((i) => !i.productSlug || !bySlug.has(i.productSlug));

  function setAmount(slug: string, n: number) {
    setCart((c) => {
      const copy = { ...c };
      if (!Number.isFinite(n) || n <= 0) delete copy[slug];
      else copy[slug] = { ...copy[slug], amount: n };
      return copy;
    });
  }
  function setPrice(slug: string, euros: string) {
    setCart((c) => {
      const entry = c[slug];
      if (!entry) return c;
      const cents = euros.trim() === "" ? undefined : Math.round(Number(euros.replace(",", ".")) * 100);
      return { ...c, [slug]: { ...entry, priceCents: Number.isFinite(cents as number) ? cents : undefined } };
    });
  }

  const lines = Object.entries(cart)
    .map(([slug, entry]) => {
      const p = bySlug.get(slug);
      if (!p) return null;
      const unitPriceCents = entry.priceCents ?? p.priceCents ?? 0;
      return {
        product: p,
        amount: entry.amount,
        byWeight: byWeight(p),
        unitPriceCents,
        overridden: entry.priceCents != null && entry.priceCents !== p.priceCents,
        lineTotalCents: Math.round(unitPriceCents * entry.amount),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const manualDiscountCents = Math.min(
    subtotalCents,
    Math.max(0, Math.round(Number(manualDiscount.replace(",", ".")) * 100) || 0),
  );

  const q = search.trim().toLowerCase();
  const addable = sellable
    .filter((p) => !cart[p.slug])
    .filter((p) => !q || `${p.name} ${p.category} ${p.slug}`.toLowerCase().includes(q))
    .slice(0, q ? 8 : 40);

  return (
    <ActionForm action={updateOrderItems} className="space-y-5">
      <input type="hidden" name="id" value={order.id} />
      {/* Only the chosen lines travel; the server re-derives every amount. */}
      {lines.map((l) => (
        <div key={l.product.slug}>
          <input type="hidden" name={`${l.byWeight ? "kg" : "qty"}_${l.product.slug}`} value={l.amount} />
          {l.overridden && (
            <input type="hidden" name={`price_${l.product.slug}`} value={(l.unitPriceCents / 100).toFixed(2)} />
          )}
        </div>
      ))}

      {orphaned.length > 0 && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn-soft-fg">
          {orphaned.length === 1 ? "Una riga fa" : `${orphaned.length} righe fanno`} riferimento a un
          prodotto non più a catalogo e verrà rimossa salvando: {orphaned.map((i) => i.name).join(", ")}.
        </p>
      )}

      {/* ── Lines ── */}
      {lines.length === 0 ? (
        <p className="text-sm text-brown-800/60">Nessun articolo: aggiungine uno qui sotto.</p>
      ) : (
        <div className="divide-y divide-brown-900/10">
          {lines.map((l) => {
            // Weight products aren't counted in units, so on-hand can't be
            // compared against kilos (see `stockUnitsForLine` on the server).
            const short = !l.byWeight && l.product.stock != null && l.product.stock < l.amount;
            return (
              <div key={l.product.slug} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-40 flex-1">
                  <p className="text-sm font-semibold text-brown-950">
                    {l.product.name}
                    {l.byWeight && (
                      <span className="ml-1.5 rounded-full bg-gold/25 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-brown-950 uppercase">
                        a peso
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-brown-800/60">
                    {euro(l.product.priceCents)}
                    {l.product.unit ? ` / ${l.product.unit}` : l.byWeight ? " / kg" : ""} · IVA{" "}
                    {vatRateLabel(l.product.vatRateBps)}
                    {!l.byWeight && l.product.stock != null ? ` · giacenza ${l.product.stock}` : ""}
                  </p>
                  {short && (
                    <p className="text-xs font-semibold text-danger">Quantità superiore alla giacenza disponibile.</p>
                  )}
                  {l.overridden && (
                    <p className="text-xs font-semibold text-warn">
                      Prezzo concordato ({euro(l.unitPriceCents)}
                      {l.byWeight ? "/kg" : ""}) — diverso dal listino.
                    </p>
                  )}
                </div>

                {/* Fixed-width wrappers: `inputCls` is `w-full`, and a bare
                    `w-24` beside it loses, stretching each field across the row. */}
                <div className="flex shrink-0 items-center gap-1">
                  <div className="w-24">
                    <input
                      type="number"
                      min={l.byWeight ? 0.001 : 1}
                      step={l.byWeight ? 0.001 : 1}
                      value={l.amount}
                      onChange={(e) => setAmount(l.product.slug, Number(e.target.value))}
                      aria-label={l.byWeight ? `Peso in kg di ${l.product.name}` : `Quantità ${l.product.name}`}
                      className={`${inputCls} text-center`}
                    />
                  </div>
                  <span className="w-6 text-xs text-brown-800/50">{l.byWeight ? "kg" : "pz"}</span>
                </div>

                <div className="w-28 shrink-0">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={l.overridden ? (l.unitPriceCents / 100).toFixed(2) : ""}
                    placeholder={l.product.priceCents != null ? (l.product.priceCents / 100).toFixed(2) : "prezzo"}
                    onChange={(e) => setPrice(l.product.slug, e.target.value)}
                    aria-label={`Prezzo concordato per ${l.product.name}${l.byWeight ? " al kg" : ""}`}
                    title="Prezzo concordato (lascia vuoto per il listino)"
                    className={inputCls}
                  />
                </div>

                <span className="w-20 shrink-0 text-right text-sm font-semibold text-brown-950">
                  {euro(l.lineTotalCents)}
                </span>
                <button
                  type="button"
                  onClick={() => setAmount(l.product.slug, 0)}
                  aria-label={`Rimuovi ${l.product.name}`}
                  className="flex size-11 items-center justify-center rounded-full text-lg text-brown-800/40 hover:bg-danger-soft hover:text-danger"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add a product ── */}
      <details className="border-t border-brown-900/10 pt-3">
        <summary className="w-fit cursor-pointer text-[12px] font-bold tracking-widest text-brown-800/60 uppercase hover:text-brown-950">
          Aggiungi un prodotto
        </summary>
        <div className="mt-3">
          <label className={labelCls} htmlFor={fid("search")}>
            Cerca nel catalogo
          </label>
          <input
            id={fid("search")}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome o categoria…"
            className={inputCls}
          />
        </div>
        <ul className="mt-2 max-h-80 divide-y divide-brown-900/10 overflow-y-auto">
          {addable.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brown-950">{p.name}</p>
                <p className="text-xs text-brown-800/60">
                  {euro(p.priceCents)}
                  {p.unit ? ` / ${p.unit}` : p.soldByWeight ? " / kg" : ""}
                  {p.stock != null ? ` · giacenza ${p.stock}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAmount(p.slug, p.soldByWeight ? 0.5 : 1)}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-brown-900/10 px-3 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
              >
                + Aggiungi
              </button>
            </li>
          ))}
          {addable.length === 0 && (
            <li className="py-2 text-sm text-brown-800/60">Nessun prodotto corrisponde.</li>
          )}
        </ul>
      </details>

      {/* ── Money knobs ── */}
      <div className="grid grid-cols-1 gap-4 border-t border-brown-900/10 pt-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor={fid("discountCode")}>
            Codice sconto
          </label>
          <input
            id={fid("discountCode")}
            name="discountCode"
            maxLength={40}
            defaultValue={order.discountCode ?? ""}
            placeholder="nessuno"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={fid("manualDiscountEuros")}>
            Sconto concordato (€)
          </label>
          <input
            id={fid("manualDiscountEuros")}
            name="manualDiscountEuros"
            type="number"
            step="0.01"
            min={0}
            value={manualDiscount}
            onChange={(e) => setManualDiscount(e.target.value)}
            placeholder="0,00"
            className={inputCls}
          />
        </div>
        {order.fulfilment !== "pickup" ? (
          <div>
            <label className={labelCls} htmlFor={fid("shippingEuros")}>
              Spese di consegna (€)
            </label>
            <input
              id={fid("shippingEuros")}
              name="shippingEuros"
              type="number"
              step="0.01"
              min={0}
              defaultValue={order.shippingOverrideCents != null ? (order.shippingOverrideCents / 100).toFixed(2) : ""}
              placeholder={`${(order.shippingCents / 100).toFixed(2)} (da zona)`}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-brown-800/60">Vuoto = tariffa della zona.</p>
          </div>
        ) : (
          // Posted empty so a pickup order carries no stale override.
          <input type="hidden" name="shippingEuros" value="" />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brown-900/10 pt-4">
        <p className="text-sm text-brown-800/70">
          Subtotale articoli:{" "}
          <strong className="font-display text-lg text-brown-950">{euro(subtotalCents)}</strong>
          {manualDiscountCents > 0 && (
            <span className="ml-2 text-ok">− {euro(manualDiscountCents)} concordato</span>
          )}
          <span className="ml-2 text-xs text-brown-800/50">coupon e consegna ricalcolati al salvataggio</span>
        </p>
        <PendingButton tone="dark">Salva articoli e importi</PendingButton>
      </div>
      <p className="text-xs text-brown-800/60">
        Prezzi e IVA sono presi dall&apos;anagrafica prodotti, salvo prezzo concordato sulla riga.
      </p>
    </ActionForm>
  );
}
