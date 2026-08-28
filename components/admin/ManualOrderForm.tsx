"use client";

import { useEffect, useMemo, useState } from "react";
import { useFieldIds } from "@/components/admin/forms";
import { Search, X } from "lucide-react";
import { Panel, euro, inputCls, labelCls } from "./ui";
import { ActionForm, PendingButton } from "./ActionForm";
import { createManualOrder } from "@/lib/admin/order-actions";
import { splitGross, vatRateLabel } from "@/lib/fiscal";
import { SETTLEMENT_INSTRUMENTS, PAYMENT_INSTRUMENT_LABEL } from "@/lib/payments/methods";
import type { ProductRow, ShopRow } from "@/lib/db/schema";
import {
  FULFILMENT_MODES,
  FULFILMENT_LABEL,
  quoteFulfilment,
  type FulfilmentMode,
  type ZoneLike,
} from "@/lib/fulfilment";

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

/** Pricing inputs resolved server-side and passed in. */
/**
 * An `order`-type reservation being rung up.
 *
 * Its fields become the form's starting values and its id rides along in a
 * hidden field, so saving both creates the sale and closes the booking. Without
 * this the two never met: someone re-typed the whole thing, or rang it into the
 * till and the platform never learned the sale had happened.
 */
export type BookingPrefill = {
  id: string;
  reference: string;
  name: string;
  phone: string;
  email: string;
  shopSlug: string;
  date: string;
  notes: string;
  /** Caparra already taken on the booking, in cents (0 when none). Carried so
   *  the counter isn't told to collect money the customer has already paid. */
  depositCents: number;
  /** Kilos on a porchetta pre-order, so the operator knows what to weigh out.
   *  Not auto-added as a line: which catalogue product a roast corresponds to is
   *  the shop's call, and guessing it wrong would misprice the sale. */
  quantityKg: number | null;
};

export type PricingSettings = {
  /** Serving areas; carriage is quoted from these, exactly as at checkout. */
  zones: ZoneLike[];
  /** Bookable pickup windows, already filtered by cut-off and capacity. */
  slotOptions?: { value: string; shopSlug: string; label: string }[];
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
  booking = null,
}: {
  products: ProductRow[];
  shops: ShopRow[];
  pricing: PricingSettings;
  booking?: BookingPrefill | null;
}) {
  const fid = useFieldIds();
  const sellable = useMemo(
    () => products.filter((p) => p.active && p.priceCents != null),
    [products],
  );
  const bySlug = useMemo(() => new Map(sellable.map((p) => [p.slug, p])), [sellable]);

  /**
   * A cart entry. `amount` is units for a normal product and kilos for one
   * priced per kg; `priceCents` overrides the catalogue price when the operator
   * agreed something else at the counter.
   */
  type Entry = { amount: number; priceCents?: number };

  const [cart, setCart] = useState<Record<string, Entry>>({});
  const [search, setSearch] = useState("");
  const [fulfilment, setFulfilment] = useState<FulfilmentMode>("pickup");
  const [shopSlug, setShopSlug] = useState(booking?.shopSlug ?? shops[0]?.slug ?? "");
  const [pickupSlot, setPickupSlot] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");
  const [shippingOverride, setShippingOverride] = useState("");
  const [markPaid, setMarkPaid] = useState(false);

  // ── Products ───────────────────────────────────────────────────────────────
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return sellable
      .filter((p) => `${p.name} ${p.category} ${p.slug}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, sellable]);

  /** Weight products step in 100 g; everything else in whole pieces. */
  const stepFor = (p: ProductRow) => (p.soldByWeight ? 0.1 : 1);

  function bump(slug: string, direction: 1 | -1) {
    const p = bySlug.get(slug);
    if (!p) return;
    const step = stepFor(p);
    setCart((c) => {
      const cur = c[slug];
      const next = Math.max(0, Number((((cur?.amount ?? 0) + direction * step)).toFixed(3)));
      const copy = { ...c };
      if (next === 0) delete copy[slug];
      else copy[slug] = { ...cur, amount: next };
      return copy;
    });
  }

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
      return {
        ...c,
        [slug]: { ...entry, priceCents: Number.isFinite(cents as number) ? cents : undefined },
      };
    });
  }

  // Memoised so the `vat` memo below (and everything else keyed on it) sees
  // the same array until the cart actually changes.
  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([slug, entry]) => {
          const p = bySlug.get(slug);
          if (!p) return null;
          const unitPriceCents = entry.priceCents ?? p.priceCents ?? 0;
          const byWeight = p.soldByWeight;
          return {
            product: p,
            amount: entry.amount,
            byWeight,
            unitPriceCents,
            overridden: entry.priceCents != null && entry.priceCents !== p.priceCents,
            lineTotalCents: Math.round(unitPriceCents * entry.amount),
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null),
    [cart, bySlug],
  );

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const manualDiscountCents = Math.min(
    subtotalCents,
    Math.max(0, Math.round(Number(manualDiscount.replace(",", ".")) * 100) || 0),
  );


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
  const [contact, setContact] = useState({
    name: booking?.name ?? "",
    phone: booking?.phone ?? "",
    email: booking?.email ?? "",
  });
  const [address, setAddress] = useState({ address: "", city: "", zip: "" });

  // ── Coupon ─────────────────────────────────────────────────────────────────
  const [code, setCode] = useState("");
  const [couponResult, setCouponResult] = useState<{ key: string; result: Coupon } | null>(null);

  // A code's applicability depends on the subtotal (minimum spend), on who is
  // buying (per-customer caps, first order only) and on where the goods change
  // hands (a code scoped to one sede), so the check is keyed on all of them:
  // any change re-validates with the exact rules `createManualOrder` prices
  // by. Empty means nothing to check. A flat string rather than an object so
  // the effect can depend on it alone (none of the parts can contain "\n").
  const trimmedCode = code.trim().toUpperCase();
  const couponKey =
    trimmedCode && subtotalCents > 0
      ? `${trimmedCode}\n${subtotalCents}\n${contact.email}\n${fulfilment}\n${shopSlug}`
      : "";

  useEffect(() => {
    if (!couponKey) return;
    const [checkCode, checkSubtotal, rawEmail, checkFulfilment, checkShop] = couponKey.split("\n");
    const checkEmail = rawEmail.trim().toLowerCase();
    let cancelled = false;
    const timer = setTimeout(async () => {
      let result: Coupon;
      try {
        const res = await fetch("/api/discounts/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: checkCode,
            subtotalCents: Number(checkSubtotal),
            email: checkEmail || undefined,
            fulfilment: checkFulfilment,
            shopSlug: checkShop,
          }),
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
  }, [couponKey]);

  // Derived rather than stored, so a stale result never outlives its input:
  // anything other than a result for the *current* key reads as "checking".
  const coupon: Coupon = !couponKey
    ? { state: "idle" }
    : couponResult?.key === couponKey
      ? couponResult.result
      : { state: "checking" };

  const couponCents = coupon.state === "ok" ? coupon.discountCents : 0;
  const discountCents = Math.min(subtotalCents, couponCents + manualDiscountCents);
  const freeShipping = coupon.state === "ok" && coupon.freeShipping;

  // Same quote the counter's order will actually be priced with. Gates are NOT
  // enforced on this path — an out-of-area CAP still prices from the fallback,
  // because the sale is physically happening — so a zone miss shows as a note
  // rather than blocking the button.
  const quote = quoteFulfilment({
    mode: fulfilment,
    subtotalCents,
    zones: pricing.zones,
    cap: address.zip,
    // `amount` is kilos on a weighed line and units otherwise, so only the
    // weighed lines contribute to a per-kg surcharge.
    weightKg: lines.reduce((kg, l) => kg + (l.byWeight ? l.amount : 0), 0),
    freeShippingCoupon: freeShipping,
  });
  const computedShipping = quote.zone && !quote.error ? quote.feeCents : 0;
  const slotsForShop = (pricing.slotOptions ?? []).filter((o) => o.shopSlug === shopSlug);
  const chosenSlot = slotsForShop.some((o) => o.value === pickupSlot) ? pickupSlot : "";
  const overrideShipping =
    shippingOverride.trim() === ""
      ? null
      : Math.max(0, Math.round(Number(shippingOverride.replace(",", ".")) * 100) || 0);
  const shippingCents = overrideShipping ?? computedShipping;
  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);

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
    <ActionForm
      action={createManualOrder}
      redirectTo="/admin/orders"
      className="space-y-6"
      guardUnsaved="Le modifiche a questo ordine non sono state salvate. Se esci adesso vanno perse."
    >
      {booking && (
        <>
          <input type="hidden" name="reservationId" value={booking.id} />
          <Panel className="border-gold/40 bg-gold/5">
            <p className="text-sm text-brown-900">
              Stai convertendo la prenotazione{" "}
              <strong className="font-semibold">{booking.reference}</strong> del {booking.date}.
              Salvando, la prenotazione viene chiusa come completata e collegata a questo ordine —
              così la vendita entra finalmente nel riepilogo IVA, nel magazzino e nei punti fedeltà.
            </p>
            {booking.quantityKg != null && (
              <p className="mt-2 text-sm font-semibold text-brown-900">
                Porchetta prenotata: {booking.quantityKg.toLocaleString("it-IT")} kg — aggiungila
                come riga a peso qui sotto.
              </p>
            )}
            {booking.notes && (
              <p className="mt-2 text-sm text-brown-800/70">Note del cliente: “{booking.notes}”</p>
            )}
            {/* The deposit is part payment, not a discount: the order total stays
                the full price (that is what the invoice and the VAT are based
                on) and this says how much is actually left to collect. Without
                it the counter charged the whole amount a second time. */}
            {booking.depositCents > 0 && (
              <p className="mt-2 text-sm font-semibold text-brown-900">
                Acconto già incassato:{" "}
                {(booking.depositCents / 100).toLocaleString("it-IT", {
                  style: "currency",
                  currency: "EUR",
                })}
                . Il totale dell&apos;ordine resta pieno — al ritiro incassa la differenza.
              </p>
            )}
          </Panel>
        </>
      )}
      {/* Only the chosen lines are submitted: kg_<slug> for a product priced per
          kg, qty_<slug> otherwise, plus price_<slug> when overridden. The server
          re-derives every amount from these. */}
      {lines.map((l) => (
        <div key={l.product.slug}>
          <input
            type="hidden"
            name={`${l.byWeight ? "kg" : "qty"}_${l.product.slug}`}
            value={l.amount}
          />
          {l.overridden && (
            <input
              type="hidden"
              name={`price_${l.product.slug}`}
              value={(l.unitPriceCents / 100).toFixed(2)}
            />
          )}
        </div>
      ))}

      {/* ── Products ── */}
      <Panel>
        <h2 className="font-display mb-4 text-lg text-brown-950">Prodotti</h2>

        <div className="relative">
          <label className={labelCls} htmlFor="prod-search">
            Cerca un prodotto
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brown-800/70" />
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
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-brown-900/10 bg-surface shadow-lg">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // A weight product starts at a plausible 0,5 kg rather
                      // than "1", which would mean a whole kilo of salame.
                      setAmount(p.slug, p.soldByWeight ? 0.5 : 1);
                      setSearch("");
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-gold/10"
                  >
                    <span className="text-brown-950">{p.name}</span>
                    <span className="shrink-0 text-xs text-brown-800/70">
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
          <p className="mt-4 rounded-lg bg-cream/60 px-4 py-6 text-center text-sm text-brown-800/70">
            Nessun articolo. Cerca un prodotto qui sopra per aggiungerlo.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-brown-900/10">
            {lines.map((l) => {
              // Weight products aren't counted in units, so on-hand can't be
              // compared against kilos (see `stockUnitsFor` on the server).
              const short =
                !l.byWeight && l.product.stock != null && l.product.stock < l.amount;
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
                    <p className="text-xs text-brown-800/70">
                      {euro(l.product.priceCents)}
                      {l.product.unit ? ` / ${l.product.unit}` : l.byWeight ? " / kg" : ""} · IVA{" "}
                      {vatRateLabel(l.product.vatRateBps)}
                      {!l.byWeight && l.product.stock != null ? ` · giacenza ${l.product.stock}` : ""}
                    </p>
                    {short && (
                      <p className="text-xs font-semibold text-danger">
                        Quantità superiore alla giacenza disponibile.
                      </p>
                    )}
                    {l.overridden && (
                      <p className="text-xs font-semibold text-warn">
                        Prezzo concordato ({euro(l.unitPriceCents)}
                        {l.byWeight ? "/kg" : ""}) — diverso dal listino.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => bump(l.product.slug, -1)}
                      aria-label={`Riduci ${l.product.name}`}
                      className="size-8 rounded-full bg-brown-900/10 text-sm font-bold text-brown-950 hover:bg-brown-900/15"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={l.byWeight ? 0.001 : 1}
                      step={l.byWeight ? 0.001 : 1}
                      value={l.amount}
                      onChange={(e) => setAmount(l.product.slug, Number(e.target.value))}
                      aria-label={l.byWeight ? `Peso in kg di ${l.product.name}` : `Quantità ${l.product.name}`}
                      className={`${inputCls} w-20 text-center`}
                    />
                    <span className="w-6 text-xs text-brown-800/70">{l.byWeight ? "kg" : "pz"}</span>
                    <button
                      type="button"
                      onClick={() => bump(l.product.slug, 1)}
                      aria-label={`Aumenta ${l.product.name}`}
                      className="size-8 rounded-full bg-brown-900/10 text-sm font-bold text-brown-950 hover:bg-brown-900/15"
                    >
                      +
                    </button>
                  </div>

                  <div>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder={
                        l.product.priceCents != null ? (l.product.priceCents / 100).toFixed(2) : "prezzo"
                      }
                      onChange={(e) => setPrice(l.product.slug, e.target.value)}
                      aria-label={`Prezzo concordato per ${l.product.name}${l.byWeight ? " al kg" : ""}`}
                      title="Prezzo concordato (lascia vuoto per il listino)"
                      className={`${inputCls} w-24`}
                    />
                  </div>

                  <span className="w-20 text-right text-sm font-semibold text-brown-950">
                    {euro(l.lineTotalCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAmount(l.product.slug, 0)}
                    aria-label={`Rimuovi ${l.product.name}`}
                    className="rounded-full p-1.5 text-brown-800/70 hover:bg-danger-soft hover:text-danger"
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
        <h2 className="font-display mb-4 text-lg text-brown-950">Cliente</h2>

        {picked ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-brown-950">
                {picked.name || picked.username}{" "}
                <span className="text-xs font-normal text-brown-800/70">@{picked.username}</span>
              </p>
              <p className="text-xs text-brown-800/70">
                {picked.points ?? 0} punti
                {picked.cardNumber ? ` · tessera ${picked.cardNumber}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={clearCustomer}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brown-900/10 px-3 py-1.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-brown-900/15"
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
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brown-800/70" />
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
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-brown-900/10 bg-surface shadow-lg">
                {found.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pick(c)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-gold/10"
                    >
                      <span className="text-brown-950">{c.name || c.username}</span>
                      <span className="shrink-0 text-xs text-brown-800/70">
                        {c.email ?? c.phone ?? `@${c.username}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-brown-800/70">
              Collegando un cliente, la vendita entra nel suo storico e accredita i punti fedeltà.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor={fid("name")}>Nome</label>
            <input
              id={fid("name")}
              name="name"
              required
              value={contact.name}
              onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
              placeholder="es. Cliente al banco"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor={fid("phone")}>Telefono</label>
            <input
              id={fid("phone")}
              name="phone"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor={fid("email")}>Email (opzionale)</label>
            <input
              id={fid("email")}
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
        <h2 className="font-display mb-4 text-lg text-brown-950">Evasione e pagamento</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor={fid("fulfilment")}>Tipo</label>
            <select
              id={fid("fulfilment")}
              name="fulfilment"
              value={fulfilment}
              onChange={(e) => setFulfilment(e.target.value as FulfilmentMode)}
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
                <label className={labelCls} htmlFor={fid("shopSlug")}>Negozio</label>
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
              {/* Optional at the counter, unlike at checkout: the customer is
                  standing here, and forcing a window on a walk-in sale would be
                  paperwork for its own sake. */}
              {slotsForShop.length > 0 && (
                <div>
                  <label className={labelCls} htmlFor={fid("pickupSlot")}>Fascia di ritiro (facoltativa)</label>
                  <select
                    id={fid("pickupSlot")}
                    name="pickupSlot"
                    value={chosenSlot}
                    onChange={(e) => setPickupSlot(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Nessuna</option>
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
                <input
                  id={fid("zip")}
                  name="zip"
                  value={address.zip}
                  onChange={(e) => setAddress((a) => ({ ...a, zip: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor={fid("address")}>Indirizzo</label>
                <input
                  id={fid("address")}
                  name="address"
                  value={address.address}
                  onChange={(e) => setAddress((a) => ({ ...a, address: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor={fid("city")}>Città</label>
                <input
                  id={fid("city")}
                  name="city"
                  value={address.city}
                  onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </>
          )}

          <div>
            <label className={labelCls} htmlFor={fid("discountCode")}>Codice sconto (opzionale)</label>
            <input
              id={fid("discountCode")}
              name="discountCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              className={`${inputCls} uppercase`}
            />
            {coupon.state === "checking" && (
              <p className="mt-1 text-xs text-brown-800/70">Verifica in corso…</p>
            )}
            {coupon.state === "ok" && (
              <p className="mt-1 text-xs font-semibold text-ok">
                ✓ Applicato: −{euro(coupon.discountCents)}
                {coupon.freeShipping ? " · spedizione gratuita" : ""}
              </p>
            )}
            {coupon.state === "error" && (
              <p className="mt-1 text-xs font-semibold text-danger">{coupon.message}</p>
            )}
          </div>

          {/* A counter sale isn't always the list price: a regular gets a round
              number off, a delivery two streets away isn't the flat rate. */}
          <div>
            <label className={labelCls} htmlFor="manual-discount">
              Sconto concordato (€)
            </label>
            <input
              id="manual-discount"
              name="manualDiscountEuros"
              type="number"
              step="0.01"
              min={0}
              value={manualDiscount}
              onChange={(e) => setManualDiscount(e.target.value)}
              placeholder="0,00"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-brown-800/70">Si somma all&apos;eventuale codice sconto.</p>
          </div>

          {fulfilment !== "pickup" && (
            <div>
              <label className={labelCls} htmlFor="shipping-override">
                {FULFILMENT_LABEL[fulfilment]} (€)
              </label>
              <input
                id="shipping-override"
                name="shippingEuros"
                type="number"
                step="0.01"
                min={0}
                value={shippingOverride}
                onChange={(e) => setShippingOverride(e.target.value)}
                placeholder={(computedShipping / 100).toFixed(2)}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-brown-800/70">
                Vuoto: applica la tariffa della zona ({euro(computedShipping)}
                {quote.zone ? ` · ${quote.zone.name}` : " · nessuna zona per questo CAP"}).
              </p>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor={fid("notes")}>Note</label>
            <textarea
              id={fid("notes")}
              name="notes"
              rows={2}
              defaultValue={
                booking
                  ? [`Da prenotazione ${booking.reference} del ${booking.date}`, booking.notes]
                      .filter(Boolean)
                      .join(" — ")
                  : ""
              }
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-4 border-t border-brown-900/10 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium text-brown-900">
            <input
              type="checkbox"
              name="markPaid"
              checked={markPaid}
              onChange={(e) => setMarkPaid(e.target.checked)}
              className="h-4 w-4 rounded accent-brown-950"
            />
            Segna come pagato (vendita al banco) — scala la giacenza
          </label>
          {/* Asked only when it is about to be recorded. Contanti and POS are
              different ModalitaPagamento on the fattura, so this is a fiscal
              field, not a statistic. */}
          {markPaid && (
            <div className="mt-3 max-w-xs">
              <label className={labelCls} htmlFor="manual-paid-with">
                Incassato con
              </label>
              <select id="manual-paid-with" name="paidWith" defaultValue="cash" className={inputCls}>
                {SETTLEMENT_INSTRUMENTS.map((i) => (
                  <option key={i} value={i}>
                    {PAYMENT_INSTRUMENT_LABEL[i]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </Panel>

      {/* ── Totals ── */}
      <Panel className="border-gold/40 bg-gold/5">
        <h2 className="font-display mb-3 text-lg text-brown-950">Riepilogo</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-brown-800/70">
            <dt>Subtotale ({lines.length} righe)</dt>
            <dd>{euro(subtotalCents)}</dd>
          </div>
          {couponCents > 0 && (
            <div className="flex justify-between text-ok">
              <dt>Sconto {trimmedCode}</dt>
              <dd>−{euro(couponCents)}</dd>
            </div>
          )}
          {manualDiscountCents > 0 && (
            <div className="flex justify-between text-ok">
              <dt>Sconto concordato</dt>
              <dd>−{euro(manualDiscountCents)}</dd>
            </div>
          )}
          {fulfilment !== "pickup" && (
            <div className="flex justify-between text-brown-800/70">
              <dt>{FULFILMENT_LABEL[fulfilment]}</dt>
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
              <tr className="text-left text-brown-800/70">
                <th scope="col" className="pt-2 pb-1 font-semibold">Aliquota</th>
                <th scope="col" className="pt-2 pb-1 text-right font-semibold">Imponibile</th>
                <th scope="col" className="pt-2 pb-1 text-right font-semibold">Imposta</th>
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
        <p className="mt-3 text-xs text-brown-800/70">
          Anteprima: prezzi, IVA, sconto e spedizione vengono ricalcolati dal server al salvataggio.
        </p>
      </Panel>

      <PendingButton>Crea ordine</PendingButton>
    </ActionForm>
  );
}
