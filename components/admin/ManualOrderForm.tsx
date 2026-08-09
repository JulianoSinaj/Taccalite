"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Panel, euro, inputCls, labelCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { createManualOrder } from "@/lib/admin/order-actions";
import { splitGross, vatRateLabel } from "@/lib/fiscal";
import type { ProductRow, ShopRow } from "@/lib/db/schema";

type Customer = {
  id: string;
  name: string | null;
  username: string;
  email: string | null;
  phone: string | null;
  points: number | null;
  cardNumber: string | null;
  lastAddress: Record<string, string> | null;
};

type Coupon =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; discountCents: number; freeShipping: boolean }
  | { state: "error"; message: string };

/** Pricing knobs that live in settings, resolved server-side and passed in. */
export type PricingSettings = {
  shippingCents: number;
  freeShippingThresholdCents: number;
};

/**
 * Counter / phone sale entry.
 *
 * Replaces the old "render every product with a number input" form: products are
 * searched and added to a cart, the total is previewed live (including VAT
 * split, shipping and a validated coupon), and an existing customer can be
 * looked up to prefill their details.
 *
 * The preview is advisory only — `createManualOrder` re-derives every amount
 * from the database, so nothing here can talk the server into a wrong price.
 */
export function ManualOrderForm({
  products,
  shops,
  pricing,
}: {
  products: ProductRow[];
  shops: ShopRow[];
  pricing: PricingSettings;
}) {
  const sellable = useMemo(
    () => products.filter((p) => p.active && p.priceCents != null),
    [products],
  );
  const bySlug = useMemo(() => new Map(sellable.map((p) => [p.slug, p])), [sellable]);

  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [fulfilment, setFulfilment] = useState<"pickup" | "shipping">("pickup");

  // ── Products ───────────────────────────────────────────────────────────────
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return sellable
      .filter((p) => `${p.name} ${p.category} ${p.slug}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, sellable]);

  function add(slug: string, delta = 1) {
    setCart((c) => {
      const next = Math.max(0, (c[slug] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[slug];
      else copy[slug] = next;
      return copy;
    });
  }

  function setQty(slug: string, n: number) {
    setCart((c) => {
      const copy = { ...c };
      if (n <= 0) delete copy[slug];
      else copy[slug] = n;
      return copy;
    });
  }

  const lines = Object.entries(cart)
    .map(([slug, quantity]) => {
      const p = bySlug.get(slug);
      return p ? { product: p, quantity, lineTotalCents: (p.priceCents ?? 0) * quantity } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);

  // ── Coupon ─────────────────────────────────────────────────────────────────
  const [code, setCode] = useState("");
  const [couponResult, setCouponResult] = useState<{ key: string; result: Coupon } | null>(null);

  // A code's applicability depends on the subtotal (minimum spend), so the check
  // is keyed on both: any cart change re-validates. An empty key means there is
  // nothing to check.
  const trimmedCode = code.trim().toUpperCase();
  const couponKey = trimmedCode && subtotalCents > 0 ? `${trimmedCode}:${subtotalCents}` : "";

  useEffect(() => {
    if (!couponKey) return;
    const [checkCode, checkSubtotal] = [couponKey.slice(0, couponKey.lastIndexOf(":")), subtotalCents];
    let cancelled = false;
    const timer = setTimeout(async () => {
      let result: Coupon;
      try {
        const res = await fetch("/api/discounts/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: checkCode, subtotalCents: checkSubtotal }),
        });
        const data = await res.json();
        result = data.ok
          ? { state: "ok", discountCents: data.discountCents, freeShipping: !!data.freeShipping }
          : { state: "error", message: data.error ?? "Codice non valido." };
      } catch {
        result = { state: "error", message: "Verifica non riuscita." };
      }
      if (!cancelled) setCouponResult({ key: couponKey, result });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [couponKey, subtotalCents]);

  // Derived rather than stored, so a stale result never outlives its input:
  // anything other than a result for the *current* key reads as "checking".
  const coupon: Coupon = !couponKey
    ? { state: "idle" }
    : couponResult?.key === couponKey
      ? couponResult.result
      : { state: "checking" };

  const discountCents = coupon.state === "ok" ? coupon.discountCents : 0;
  const freeShipping = coupon.state === "ok" && coupon.freeShipping;
  const shippingCents =
    fulfilment === "shipping" &&
    !freeShipping &&
    (pricing.freeShippingThresholdCents === 0 || subtotalCents < pricing.freeShippingThresholdCents)
      ? pricing.shippingCents
      : 0;
  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

  // VAT split of the previewed total, mirroring how the receipt will read.
  const vat = useMemo(() => {
    const byRate = new Map<number, number>();
    for (const l of lines) {
      byRate.set(l.product.vatRateBps, (byRate.get(l.product.vatRateBps) ?? 0) + l.lineTotalCents);
    }
    return [...byRate.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rateBps, gross]) => ({ rateBps, ...splitGross(gross, rateBps) }));
  }, [lines]);

  // ── Customer lookup ────────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState("");
  const [matched, setMatched] = useState<{ key: string; list: Customer[] } | null>(null);
  const [picked, setPicked] = useState<Customer | null>(null);
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [address, setAddress] = useState({ address: "", city: "", zip: "" });

  const customerKey = customerQuery.trim().length >= 2 ? customerQuery.trim() : "";

  useEffect(() => {
    if (!customerKey) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(customerKey)}`);
        const data = await res.json();
        if (!cancelled && data.ok) setMatched({ key: customerKey, list: data.customers });
      } catch {
        /* a failed lookup just means no suggestions */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerKey]);

  // Suggestions only ever belong to the term currently in the box.
  const found = customerKey && matched?.key === customerKey ? matched.list : [];

  function pick(c: Customer) {
    setPicked(c);
    setContact({ name: c.name || c.username, phone: c.phone ?? "", email: c.email ?? "" });
    if (c.lastAddress) {
      setAddress({
        address: c.lastAddress.address ?? "",
        city: c.lastAddress.city ?? "",
        zip: c.lastAddress.zip ?? "",
      });
    }
    setCustomerQuery("");
  }

  function clearCustomer() {
    setPicked(null);
    setContact({ name: "", phone: "", email: "" });
  }

  return (
    <ActionForm action={createManualOrder} redirectTo="/admin/orders" className="space-y-6">
      {/* Only the chosen lines are submitted, as qty_<slug>. */}
      {lines.map((l) => (
        <input key={l.product.slug} type="hidden" name={`qty_${l.product.slug}`} value={l.quantity} />
      ))}

      {/* ── Products ── */}
      <Panel>
        <h3 className="font-display mb-4 text-lg text-brown-950">Prodotti</h3>

        <div className="relative">
          <label className={labelCls} htmlFor="prod-search">
            Cerca un prodotto
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brown-800/40" />
            <input
              id="prod-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, categoria…"
              autoComplete="off"
              className={`${inputCls} pl-9`}
            />
          </div>
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-brown-900/10 bg-white shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      add(p.slug);
                      setSearch("");
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-gold/10"
                  >
                    <span className="text-brown-950">{p.name}</span>
                    <span className="shrink-0 text-xs text-brown-800/60">
                      {euro(p.priceCents)}
                      {p.stock != null ? ` · ${p.stock} pz` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="mt-4 rounded-lg bg-cream/60 px-4 py-6 text-center text-sm text-brown-800/60">
            Nessun articolo. Cerca un prodotto qui sopra per aggiungerlo.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-brown-900/10">
            {lines.map((l) => {
              const short = l.product.stock != null && l.product.stock < l.quantity;
              return (
                <div key={l.product.slug} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-brown-950">{l.product.name}</p>
                    <p className="text-xs text-brown-800/60">
                      {euro(l.product.priceCents)}
                      {l.product.unit ? ` / ${l.product.unit}` : ""} · IVA{" "}
                      {vatRateLabel(l.product.vatRateBps)}
                      {l.product.stock != null ? ` · giacenza ${l.product.stock}` : ""}
                    </p>
                    {short && (
                      <p className="text-xs font-semibold text-red-600">
                        Quantità superiore alla giacenza disponibile.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => add(l.product.slug, -1)}
                      aria-label={`Riduci ${l.product.name}`}
                      className="size-8 rounded-full bg-brown-900/10 text-sm font-bold text-brown-950 hover:bg-brown-900/15"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) => setQty(l.product.slug, Number(e.target.value) || 0)}
                      aria-label={`Quantità ${l.product.name}`}
                      className={`${inputCls} w-16 text-center`}
                    />
                    <button
                      type="button"
                      onClick={() => add(l.product.slug, 1)}
                      aria-label={`Aumenta ${l.product.name}`}
                      className="size-8 rounded-full bg-brown-900/10 text-sm font-bold text-brown-950 hover:bg-brown-900/15"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold text-brown-950">
                    {euro(l.lineTotalCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(l.product.slug, 0)}
                    aria-label={`Rimuovi ${l.product.name}`}
                    className="rounded-full p-1.5 text-brown-800/40 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* ── Customer ── */}
      <Panel>
        <h3 className="font-display mb-4 text-lg text-brown-950">Cliente</h3>

        {picked ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-brown-950">
                {picked.name || picked.username}{" "}
                <span className="text-xs font-normal text-brown-800/60">@{picked.username}</span>
              </p>
              <p className="text-xs text-brown-800/60">
                {picked.points ?? 0} punti
                {picked.cardNumber ? ` · tessera ${picked.cardNumber}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={clearCustomer}
              className="rounded-full bg-brown-900/10 px-3 py-1.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
            >
              Scollega
            </button>
          </div>
        ) : (
          <div className="relative mb-4">
            <label className={labelCls} htmlFor="cust-search">
              Cerca un cliente registrato (facoltativo)
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brown-800/40" />
              <input
                id="cust-search"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder="Nome, email, telefono o tessera…"
                autoComplete="off"
                className={`${inputCls} pl-9`}
              />
            </div>
            {found.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-brown-900/10 bg-white shadow-lg">
                {found.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pick(c)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-gold/10"
                    >
                      <span className="text-brown-950">{c.name || c.username}</span>
                      <span className="shrink-0 text-xs text-brown-800/60">
                        {c.email ?? c.phone ?? `@${c.username}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-brown-800/60">
              Collegando un cliente, la vendita entra nel suo storico e accredita i punti fedeltà.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Nome</label>
            <input
              name="name"
              required
              value={contact.name}
              onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
              placeholder="es. Cliente al banco"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Telefono</label>
            <input
              name="phone"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Email (opzionale)</label>
            <input
              name="email"
              type="email"
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              className={inputCls}
            />
          </div>
        </div>
      </Panel>

      {/* ── Fulfilment + payment ── */}
      <Panel>
        <h3 className="font-display mb-4 text-lg text-brown-950">Evasione e pagamento</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Tipo</label>
            <select
              name="fulfilment"
              value={fulfilment}
              onChange={(e) => setFulfilment(e.target.value as "pickup" | "shipping")}
              className={inputCls}
            >
              <option value="pickup">Ritiro in negozio</option>
              <option value="shipping">Spedizione</option>
            </select>
          </div>

          {fulfilment === "pickup" ? (
            <div>
              <label className={labelCls}>Negozio</label>
              <select name="shopSlug" defaultValue={shops[0]?.slug} className={inputCls}>
                {shops.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>CAP</label>
                <input
                  name="zip"
                  value={address.zip}
                  onChange={(e) => setAddress((a) => ({ ...a, zip: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Indirizzo</label>
                <input
                  name="address"
                  value={address.address}
                  onChange={(e) => setAddress((a) => ({ ...a, address: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Città</label>
                <input
                  name="city"
                  value={address.city}
                  onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </>
          )}

          <div>
            <label className={labelCls}>Codice sconto (opzionale)</label>
            <input
              name="discountCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              className={`${inputCls} uppercase`}
            />
            {coupon.state === "checking" && (
              <p className="mt-1 text-xs text-brown-800/60">Verifica in corso…</p>
            )}
            {coupon.state === "ok" && (
              <p className="mt-1 text-xs font-semibold text-emerald-700">
                ✓ Applicato: −{euro(coupon.discountCents)}
                {coupon.freeShipping ? " · spedizione gratuita" : ""}
              </p>
            )}
            {coupon.state === "error" && (
              <p className="mt-1 text-xs font-semibold text-red-600">{coupon.message}</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={labelCls}>Note</label>
            <textarea name="notes" rows={2} className={inputCls} />
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-brown-900">
          <input type="checkbox" name="markPaid" className="h-4 w-4 rounded accent-brown-950" />
          Segna come pagato (vendita al banco) — scala la giacenza
        </label>
      </Panel>

      {/* ── Totals ── */}
      <Panel className="border-gold/40 bg-gold/5">
        <h3 className="font-display mb-3 text-lg text-brown-950">Riepilogo</h3>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-brown-800/70">
            <dt>Subtotale ({lines.reduce((n, l) => n + l.quantity, 0)} articoli)</dt>
            <dd>{euro(subtotalCents)}</dd>
          </div>
          {discountCents > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>Sconto {trimmedCode}</dt>
              <dd>−{euro(discountCents)}</dd>
            </div>
          )}
          {fulfilment === "shipping" && (
            <div className="flex justify-between text-brown-800/70">
              <dt>Spedizione</dt>
              <dd>{shippingCents === 0 ? "Gratuita" : euro(shippingCents)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-brown-900/10 pt-2 font-display text-xl font-bold text-brown-950">
            <dt>Totale</dt>
            <dd>{euro(totalCents)}</dd>
          </div>
        </dl>

        {vat.length > 0 && (
          <table className="mt-3 w-full border-t border-brown-900/10 pt-2 text-xs text-brown-800/70">
            <thead>
              <tr className="text-left text-brown-800/50">
                <th className="pt-2 pb-1 font-semibold">Aliquota</th>
                <th className="pt-2 pb-1 text-right font-semibold">Imponibile</th>
                <th className="pt-2 pb-1 text-right font-semibold">Imposta</th>
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
        )}
        <p className="mt-3 text-xs text-brown-800/60">
          Anteprima: prezzi, IVA, sconto e spedizione vengono ricalcolati dal server al salvataggio.
        </p>
      </Panel>

      <PendingButton>Crea ordine</PendingButton>
    </ActionForm>
  );
}
