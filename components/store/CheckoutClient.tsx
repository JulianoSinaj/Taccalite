"use client";

import { useRef, useState, type FormEvent } from "react";
import { PrivacyNote } from "@/components/site/PrivacyNote";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "./cart";
import SelectField from "@/components/ui/SelectField";
import { formatEuro } from "@/lib/format";
import {
  FULFILMENT_MODES,
  FULFILMENT_LABEL,
  quoteFulfilment,
  type FulfilmentMode,
  type ZoneLike,
} from "@/lib/fulfilment";
import {
  paymentMethodsFor,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_HINT,
  type CustomerPaymentMethod,
  type PaymentAvailability,
} from "@/lib/payments/methods";

const inputCls =
  "w-full  border border-rule-strong bg-paper-warm/40 px-4 py-3.5 text-sm text-brown-950 focus:border-gold-dark focus:outline-none";
// Field labels, not section eyebrows: no leading rule (see globals.css).
const labelCls =
  "mb-1.5 block text-[0.625rem] font-semibold tracking-[0.22em] text-gold-deep uppercase";

type CheckoutUser = { name: string; email: string | null; phone: string | null };

/** The signed-in customer's default saved address, when they have one. */
export type CheckoutAddress = {
  street: string;
  city: string;
  postcode: string;
};

/** One bookable pickup window, already filtered by cut-off and capacity. */
export type SlotChoice = {
  value: string;
  shopSlug: string;
  label: string;
  remaining: number | null;
};

export default function CheckoutClient({
  shops,
  pointsPerEuro = 1,
  loyaltyEnabled = true,
  zones = [],
  slotOptions = [],
  user = null,
  defaultAddress = null,
  cancelled = false,
  payments,
}: {
  shops: { slug: string; name: string }[];
  pointsPerEuro?: number;
  loyaltyEnabled?: boolean;
  /** Serving areas and their prices — quoted here, charged on the server. */
  zones?: ZoneLike[];
  slotOptions?: SlotChoice[];
  user?: CheckoutUser | null;
  defaultAddress?: CheckoutAddress | null;
  /** The visitor came back from Stripe without paying (`?annullato=1`). */
  cancelled?: boolean;
  /** Which payment methods the shop currently offers. Re-checked on the server. */
  payments: PaymentAvailability;
}) {
  const { items, subtotalCents, setQty, remove } = useCart();
  const [fulfilment, setFulfilment] = useState<FulfilmentMode>("pickup");
  const [shopSlug, setShopSlug] = useState(shops[0]?.slug ?? "");
  const [pickupSlot, setPickupSlot] = useState("");
  // Seeded from the saved address so a repeat customer is not retyping their
  // own street every order. Still a plain input afterwards: this is a starting
  // value, not a binding — the address that ships is whatever is in the fields
  // at submit, and `createOrder` re-prices the CAP server-side regardless.
  const [zip, setZip] = useState(defaultAddress?.postcode ?? "");
  const [payMethod, setPayMethod] = useState<CustomerPaymentMethod>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local delivery only appears when the shop actually runs a round; without a
  // zone the button would be an offer nobody could accept.
  const modes = FULFILMENT_MODES.filter(
    (m) => m !== "delivery" || zones.some((z) => z.active && z.mode === "delivery"),
  );
  const slotsForShop = slotOptions.filter((o) => o.shopSlug === shopSlug);
  const chosenSlot = slotsForShop.some((o) => o.value === pickupSlot) ? pickupSlot : "";

  // Discount code (optional). The preview amount is validated server-side, with
  // the same customer and sede the order will be priced for; the order endpoint
  // re-validates authoritatively on submit. The applied preview captures the
  // inputs it was computed for — the subtotal (a percent code depends on it),
  // the fulfilment and the sede (a code can be scoped to one counter). Any
  // change makes it stale, so `coupon` is derived as valid only while they
  // still match, no reset-effect needed; the note below asks for a re-apply
  // rather than silently pricing without it.
  const couponContext = `${subtotalCents}|${fulfilment}|${shopSlug}`;
  const emailRef = useRef<HTMLInputElement>(null);
  const [couponInput, setCouponInput] = useState("");
  const [applied, setApplied] = useState<
    { code: string; discountCents: number; freeShipping: boolean; context: string } | null
  >(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const coupon = applied && applied.context === couponContext ? applied : null;
  const couponStale = applied != null && coupon == null;

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          subtotalCents,
          fulfilment,
          shopSlug,
          email: emailRef.current?.value.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Codice non valido");
      setApplied({
        code: json.code,
        discountCents: json.discountCents,
        freeShipping: json.freeShipping,
        context: couponContext,
      });
    } catch (err) {
      setApplied(null);
      setCouponError(err instanceof Error ? err.message : "Codice non valido");
    } finally {
      setCouponBusy(false);
    }
  }

  const discountCents = coupon?.discountCents ?? 0;

  // Weight for zones that price per kg. The cart stores no `soldByWeight` flag,
  // so the unit is the evidence available here; a product priced per kg that is
  // not actually sold by weight would be over-quoted, which is the safe
  // direction — the server re-quotes from the catalogue and charges less, never
  // more than was shown.
  const weightKg = items.reduce(
    (kg, i) => kg + ((i.unit ?? "").toLowerCase() === "kg" ? i.qty : 0),
    0,
  );

  // The identical function the server prices with, so the figure below and the
  // figure charged cannot drift apart.
  const quote = quoteFulfilment({
    mode: fulfilment,
    subtotalCents,
    zones,
    cap: zip,
    weightKg,
    freeShippingCoupon: coupon?.freeShipping,
  });
  const effectiveShippingCents = quote.feeCents;
  const totalCents = Math.max(0, subtotalCents - discountCents + effectiveShippingCents);

  // Which methods this order may use, from the same function the server refuses
  // with. Derived rather than kept in sync by an effect: switching from ritiro to
  // spedizione retires "pago in bottega", and a selection that is no longer on
  // offer has to fall back to one that is, not silently post itself anyway.
  const methodOptions = paymentMethodsFor(fulfilment, totalCents, payments);
  const paymentMethod: CustomerPaymentMethod | undefined = methodOptions.includes(payMethod)
    ? payMethod
    : methodOptions[0];

  // What the mode buttons can promise before a CAP is known: the cheapest zone
  // serving that mode. "Da €5,00" is honest; a single flat number no longer is.
  const cheapest = (mode: FulfilmentMode) => {
    const fees = zones.filter((z) => z.active && z.mode === mode).map((z) => z.feeCents);
    return fees.length ? Math.min(...fees) : null;
  };
  const modeLabel = (m: FulfilmentMode) => {
    if (m === "pickup") return "Ritiro in bottega";
    const from = cheapest(m);
    return `${FULFILMENT_LABEL[m]}${from != null ? ` (da ${formatEuro(from)})` : ""}`;
  };

  // Everything that must be true before the order can be sent. Kept as one
  // expression so the button and the message below can never disagree.
  const slotMissing = fulfilment === "pickup" && slotsForShop.length > 0 && !chosenSlot;
  const blocked =
    quote.error ??
    (slotMissing
      ? "Scegli un orario di ritiro."
      : !paymentMethod
        ? "Nessun metodo di pagamento disponibile. Chiamaci in bottega."
        : null);
  // Loyalty points are earned on the goods subtotal (server-authoritative on award).
  const pointsPreview = Math.floor((subtotalCents / 100) * pointsPerEuro);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    // `FormData.get` returns **null** for a field that is not in the DOM, and the
    // address block only renders for delivery/shipping. `null` is not the same as
    // absent to Zod — `.optional()` accepts a missing key and rejects an explicit
    // null — so every pickup order was refused with a raw
    // "expected string, received null" and no order was ever created. Required
    // fields keep "" so their own friendly messages still fire; optional ones
    // become undefined.
    const req = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v : "";
    };
    const opt = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" && v.trim() !== "" ? v : undefined;
    };
    const payload = {
      items: items.map((i) => ({ slug: i.slug, quantity: i.qty })),
      name: req("name"),
      email: req("email"),
      phone: opt("phone"),
      fulfilment,
      shopSlug,
      pickupSlot: chosenSlot || undefined,
      address: opt("address"),
      city: opt("city"),
      zip: zip || undefined,
      notes: opt("notes"),
      paymentMethod,
      discountCode: coupon?.code,
      company: req("company"),
    };
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      // Deliberately NOT clearing the cart here. Stripe sends the customer back
      // to `/checkout?annullato=1` if they abandon payment, and a cart emptied
      // at redirect time would greet them with "Il carrello è vuoto" and lose
      // the sale. The success page clears it once the order is actually paid
      // (`components/store/ClearCart.tsx`).
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <section className="flex min-h-[65svh] items-center justify-center bg-cream px-5 pt-32 pb-20 text-center">
        <div>
          <h1 className="font-display text-4xl tracking-[-0.028em] text-brown-950">Il carrello è vuoto</h1>
          <p className="mt-4 text-brown-700">Aggiungi le nostre specialità dal negozio online.</p>
          <Link
            href="/negozio"
            className="mt-8 inline-flex rounded-full bg-gold px-8 py-3.5 text-sm font-semibold text-brown-950 hover:bg-gold-dark"
          >
            Vai al negozio
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-cream px-5 pt-28 pb-24 sm:px-8 sm:pt-40 lg:px-12">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
        {/* Cart */}
        <div>
          <h1 className="font-display mb-6 text-[2rem] tracking-[-0.028em] text-brown-950 sm:mb-8 sm:text-4xl">
            Il tuo ordine
          </h1>
          {cancelled && (
            <div
              role="status"
              className="mb-8 border border-gold-dark/40 bg-gold/15 px-5 py-4 text-sm text-brown-900"
            >
              <p className="font-semibold text-brown-950">Pagamento annullato</p>
              <p className="mt-1 text-brown-700">
                Nessun addebito è stato effettuato. Il tuo carrello è ancora qui: puoi riprovare quando vuoi.
              </p>
            </div>
          )}
          <div className="space-y-4">
            {/* Two rows on a phone. Name, stepper, line total and a bin on one
                375px row left about sixty pixels for the name, so "Salame di
                Fabriano" arrived as four wrapped lines beside a stepper that was
                itself too small to hit. Splitting the row costs one line of
                height and gives the name the full measure. */}
            {items.map((i) => (
              <div key={i.slug} className="border border-rule bg-paper-warm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg leading-tight text-brown-950">{i.name}</p>
                    <p className="mt-0.5 text-sm text-taupe">
                      {formatEuro(i.priceCents)}
                      {i.unit ? ` / ${i.unit}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Rimuovi ${i.name}`}
                    onClick={() => remove(i.slug)}
                    className="tap -mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center text-taupe transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-full border border-rule bg-paper/60 p-1">
                    <button
                      type="button"
                      aria-label={`Riduci ${i.name}`}
                      onClick={() => setQty(i.slug, i.qty - 1)}
                      className="flex size-11 items-center justify-center rounded-full bg-brown-950 text-cream focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-8 text-center font-bold text-brown-950 tabular-nums">{i.qty}</span>
                    <button
                      type="button"
                      aria-label={`Aumenta ${i.name}`}
                      onClick={() => setQty(i.slug, i.qty + 1)}
                      className="flex size-11 items-center justify-center rounded-full bg-brown-950 text-cream focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <p className="font-bold text-brown-950 tabular-nums">{formatEuro(i.priceCents * i.qty)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Coupon */}
          <div className="mt-6 border border-rule bg-paper-warm p-4">
            <label className={labelCls} htmlFor="coupon">Codice sconto</label>
            <div className="flex gap-2">
              <input
                id="coupon"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCoupon();
                  }
                }}
                placeholder="es. BENVENUTO10"
                className={`${inputCls} uppercase`}
              />
              <button
                type="button"
                onClick={applyCoupon}
                disabled={couponBusy || !couponInput.trim()}
                className="shrink-0 bg-brown-950 px-5 py-3.5 text-xs font-bold tracking-widest text-cream uppercase hover:bg-brown-900 disabled:opacity-50"
              >
                {couponBusy ? "…" : "Applica"}
              </button>
            </div>
            {couponError && <p className="mt-2 text-xs font-medium text-red-700">{couponError}</p>}
            {couponStale && !couponError && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                L’ordine è cambiato: premi «Applica» per ricontrollare il codice {applied.code}.
              </p>
            )}
            {coupon && (
              <p className="mt-2 flex items-center justify-between text-xs font-medium text-emerald-700">
                <span>Codice {coupon.code} applicato ✓</span>
                <button type="button" onClick={() => { setApplied(null); setCouponInput(""); }} className="py-2 pl-3 underline">
                  Rimuovi
                </button>
              </p>
            )}
          </div>

          <div className="mt-6 space-y-2 border-t border-rule pt-6 text-sm">
            <div className="flex justify-between text-brown-700">
              <span>Subtotale</span>
              <span>{formatEuro(subtotalCents)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Sconto{coupon ? ` (${coupon.code})` : ""}</span>
                <span>−{formatEuro(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-brown-700">
              <span>{FULFILMENT_LABEL[fulfilment]}</span>
              <span>
                {fulfilment === "pickup"
                  ? "Gratis"
                  : quote.error
                    ? "—"
                    : quote.freeApplied
                      ? "Gratis"
                      : formatEuro(effectiveShippingCents)}
              </span>
            </div>
            {quote.zone && !quote.error && (
              <p className="text-xs text-taupe">
                {quote.zone.name}
                {quote.zone.note ? ` · ${quote.zone.note}` : ""}
                {quote.zone.leadTimeHours > 0
                  ? ` · ordina con almeno ${quote.zone.leadTimeHours} h di anticipo`
                  : ""}
              </p>
            )}
            <div className="flex justify-between pt-2 font-display text-xl font-bold text-brown-950">
              <span>Totale</span>
              <span>{formatEuro(totalCents)}</span>
            </div>
          </div>
        </div>

        {/* Details form */}
        <form onSubmit={handleSubmit} className="space-y-6 border border-rule bg-paper p-5 sm:p-8 lg:p-10">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="name">Nome completo</label>
              <input id="name" name="name" required defaultValue={user?.name ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="phone">
                Telefono{fulfilment === "delivery" || payMethod === "on_delivery" ? "" : " (facoltativo)"}
              </label>
              {/* Required exactly when the server will refuse without it (see
                  `checkoutSchema`): someone has to be reachable at the door. */}
              <input
                id="phone"
                name="phone"
                type="tel"
                required={fulfilment === "delivery" || payMethod === "on_delivery"}
                defaultValue={user?.phone ?? ""}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="email">Email</label>
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              required
              defaultValue={user?.email ?? ""}
              className={inputCls}
            />
          </div>

          <div>
            <span className={labelCls}>Consegna</span>
            <div className={`grid gap-3 ${modes.length > 2 ? "sm:grid-cols-3" : "grid-cols-2"}`}>
              {modes.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFulfilment(f)}
                  aria-pressed={fulfilment === f}
                  className={` border px-3 py-4 text-sm font-semibold ${
 fulfilment === f ? "border-gold-dark bg-gold/15 text-brown-950" : "border-rule text-taupe"
 }`}
                >
                  {modeLabel(f)}
                </button>
              ))}
            </div>
          </div>

          {fulfilment === "pickup" ? (
            <div className="grid grid-cols-1 gap-5">
              <div>
                <label className={labelCls} htmlFor="shopSlug">Negozio di ritiro</label>
                <SelectField
                  id="shopSlug"
                  name="shopSlug"
                  value={shopSlug}
                  onChange={setShopSlug}
                  options={shops.map((s) => ({ value: s.slug, label: s.name }))}
                  className={inputCls}
                />
              </div>

              {/* Only rendered where the shop has published windows. A location
                  with none keeps the old behaviour — choose the shop, turn up
                  when you like — instead of being blocked by a picker with
                  nothing in it. */}
              {slotsForShop.length > 0 && (
                <div>
                  <label className={labelCls} htmlFor="pickupSlot">Quando passi a ritirare</label>
                  {/* "ultimi 2 posti" was an em-dash clause on the end of a
                      native option, where it was the first thing to be
                      truncated on a phone — exactly the part a customer needs
                      to see. It is the option's second line now. */}
                  <SelectField
                    id="pickupSlot"
                    value={chosenSlot}
                    onChange={setPickupSlot}
                    required
                    placeholder="Scegli un orario…"
                    options={slotsForShop.map((o) => ({
                      value: o.value,
                      label: o.label,
                      hint: o.remaining != null && o.remaining <= 3 ? `Ultimi ${o.remaining} posti` : undefined,
                    }))}
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="address">Indirizzo</label>
                <input
                  id="address"
                  name="address"
                  required
                  autoComplete="street-address"
                  defaultValue={defaultAddress?.street ?? ""}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="city">Città</label>
                <input
                  id="city"
                  name="city"
                  required
                  autoComplete="address-level2"
                  defaultValue={defaultAddress?.city ?? ""}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="zip">CAP</label>
                <input
                  id="zip"
                  name="zip"
                  required
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  aria-describedby={quote.error ? "zip-error" : undefined}
                  className={inputCls}
                />
              </div>
              {/* Said here, next to the field that causes it, and before payment
                  — the customer used to reach Stripe and only then be refused. */}
              {quote.error && zip.length > 0 && (
                <p id="zip-error" className="text-sm font-medium text-red-700 sm:col-span-2">
                  {quote.error}
                </p>
              )}
            </div>
          )}

          {/* Payment method. Only rendered when there is a genuine choice: a
              single option is not a decision, it is a paragraph of text between
              the customer and the button. */}
          {methodOptions.length > 1 && (
            <fieldset>
              <legend className={labelCls}>Pagamento</legend>
              <div className="space-y-2">
                {methodOptions.map((m) => (
                  <label
                    key={m}
                    className={`flex cursor-pointer gap-3 border px-4 py-3.5 ${
                      paymentMethod === m
                        ? "border-gold-dark bg-gold/15"
                        : "border-rule hover:border-rule-strong"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={m}
                      checked={paymentMethod === m}
                      onChange={() => setPayMethod(m)}
                      className="mt-1 size-4 shrink-0 accent-brown-950"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-brown-950">
                        {PAYMENT_METHOD_LABEL[m]}
                      </span>
                      <span className="mt-0.5 block text-xs text-taupe">{PAYMENT_METHOD_HINT[m]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <label className={labelCls} htmlFor="notes">Note (opzionale)</label>
            <textarea id="notes" name="notes" rows={2} className={inputCls} />
          </div>

          <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0" />

          {/* Points are credited by `finalizeOrder` only when the order has a
              `userId`, i.e. only when the buyer was signed in. This block used
              to render for everyone, so a guest was promised points the system
              would never pay them. Say the true thing to each visitor — and to
              the guest, make it the reason to have an account. */}
          {loyaltyEnabled && pointsPreview > 0 && (
            user ? (
              <p className="bg-gold/10 px-4 py-3 text-sm text-brown-950">
                Con questo ordine guadagnerai ~{pointsPreview}{" "}
                {pointsPreview === 1 ? "punto" : "punti"} fedeltà.
              </p>
            ) : (
              <p className="bg-gold/10 px-4 py-3 text-sm text-brown-950">
                <Link href="/account" className="font-semibold underline">
                  Accedi o registrati
                </Link>{" "}
                per guadagnare ~{pointsPreview}{" "}
                {pointsPreview === 1 ? "punto" : "punti"} fedeltà con questo ordine. Puoi anche
                completare l&apos;ordine come ospite e collegarlo dopo.
              </p>
            )
          )}

          {error && <p className="text-sm font-medium text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy || !!blocked}
            className="w-full rounded-full bg-gold px-8 py-4 text-xs font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-gold-dark disabled:opacity-60"
          >
            {busy
              ? "Elaborazione…"
              : blocked
                ? blocked
                : paymentMethod === "card"
                  ? `Paga ${formatEuro(totalCents)}`
                  : `Conferma ordine · ${formatEuro(totalCents)}`}
          </button>
          {/* The reassurance has to match what is about to happen: telling
              someone paying at the counter that their payment is secure invites
              them to look for a card form that is not there. */}
          <p className="text-center text-xs text-taupe">
            {paymentMethod === "card"
              ? "Pagamento sicuro con Stripe. I dati della carta non transitano dai nostri server."
              : paymentMethod === "on_delivery"
                ? "Nessun addebito online: pagherai alla consegna, in contanti o con il POS."
                : "Nessun addebito online: pagherai in bottega al momento del ritiro."}
          </p>
          {/* Terms as well as privacy: this is the button that forms the
              contract, so it is the point at which the conditions of sale and
              the right of withdrawal have to be reachable. */}
          <PrivacyNote action="confermando l'ordine" terms className="text-center" />
        </form>
      </div>
    </section>
  );
}
