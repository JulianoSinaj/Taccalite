"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "./cart";
import { formatEuro } from "@/lib/format";

const SHIPPING_CENTS = 700;
const inputCls =
  "w-full rounded-xl border border-brown-900/15 bg-cream-dark/40 px-4 py-3 text-sm text-brown-950 focus:border-gold-dark focus:outline-none";
const labelCls = "eyebrow eyebrow-dark block mb-1.5";

type CheckoutUser = { name: string; email: string | null; phone: string | null };

export default function CheckoutClient({
  shops,
  pointsPerEuro = 1,
  user = null,
}: {
  shops: { slug: string; name: string }[];
  pointsPerEuro?: number;
  user?: CheckoutUser | null;
}) {
  const { items, subtotalCents, setQty, remove, clear } = useCart();
  const [fulfilment, setFulfilment] = useState<"pickup" | "shipping">("pickup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shippingCents = fulfilment === "shipping" ? SHIPPING_CENTS : 0;
  const totalCents = subtotalCents + shippingCents;
  // Loyalty points are earned on the goods subtotal (server-authoritative on award).
  const pointsPreview = Math.floor((subtotalCents / 100) * pointsPerEuro);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      items: items.map((i) => ({ slug: i.slug, quantity: i.qty })),
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      fulfilment,
      shopSlug: fd.get("shopSlug"),
      address: fd.get("address"),
      city: fd.get("city"),
      zip: fd.get("zip"),
      notes: fd.get("notes"),
      company: fd.get("company"),
    };
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Errore imprevisto");
      clear();
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
      setBusy(false);
    }
  }

  if (items.length === 0) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center bg-cream px-5 pt-32 pb-20 text-center">
        <div>
          <h1 className="font-display text-4xl tracking-tighter text-brown-950">Il carrello è vuoto</h1>
          <p className="mt-4 text-brown-900/70">Aggiungi le nostre specialità dal negozio online.</p>
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
    <section className="bg-cream px-5 pt-32 pb-24 sm:px-10 sm:pt-40">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-2">
        {/* Cart */}
        <div>
          <h1 className="font-display mb-8 text-4xl tracking-tighter text-brown-950">Il tuo ordine</h1>
          <div className="space-y-4">
            {items.map((i) => (
              <div key={i.slug} className="flex items-center gap-4 rounded-2xl border border-brown-900/10 bg-white/60 p-4">
                <div className="flex-1">
                  <p className="font-display text-lg text-brown-950">{i.name}</p>
                  <p className="text-sm text-brown-800/60">
                    {formatEuro(i.priceCents)}
                    {i.unit ? ` / ${i.unit}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-brown-900/10 bg-cream-dark/50 p-1">
                  <button type="button" aria-label="Riduci" onClick={() => setQty(i.slug, i.qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-brown-950 text-cream">
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-8 text-center font-bold text-brown-950">{i.qty}</span>
                  <button type="button" aria-label="Aumenta" onClick={() => setQty(i.slug, i.qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-brown-950 text-cream">
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <p className="w-20 text-right font-bold text-brown-950">{formatEuro(i.priceCents * i.qty)}</p>
                <button type="button" aria-label="Rimuovi" onClick={() => remove(i.slug)} className="text-brown-800/50 hover:text-red-600">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-2 border-t border-brown-900/10 pt-6 text-sm">
            <div className="flex justify-between text-brown-800/80">
              <span>Subtotale</span>
              <span>{formatEuro(subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-brown-800/80">
              <span>Spedizione</span>
              <span>{shippingCents ? formatEuro(shippingCents) : "Gratis (ritiro)"}</span>
            </div>
            <div className="flex justify-between pt-2 font-display text-xl font-bold text-brown-950">
              <span>Totale</span>
              <span>{formatEuro(totalCents)}</span>
            </div>
          </div>
        </div>

        {/* Details form */}
        <form onSubmit={handleSubmit} className="space-y-6 rounded-[28px] border border-brown-900/10 bg-white/70 p-8 sm:p-10">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="name">Nome completo</label>
              <input id="name" name="name" required defaultValue={user?.name ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="phone">Telefono</label>
              <input id="phone" name="phone" type="tel" defaultValue={user?.phone ?? ""} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required defaultValue={user?.email ?? ""} className={inputCls} />
          </div>

          <div>
            <span className={labelCls}>Consegna</span>
            <div className="grid grid-cols-2 gap-3">
              {(["pickup", "shipping"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFulfilment(f)}
                  className={`rounded-xl border p-3 text-sm font-semibold ${
                    fulfilment === f ? "border-gold-dark bg-gold/15 text-brown-950" : "border-brown-900/12 text-brown-800/70"
                  }`}
                >
                  {f === "pickup" ? "Ritiro in bottega" : "Spedizione (+€7)"}
                </button>
              ))}
            </div>
          </div>

          {fulfilment === "pickup" ? (
            <div>
              <label className={labelCls} htmlFor="shopSlug">Negozio di ritiro</label>
              <select id="shopSlug" name="shopSlug" className={inputCls}>
                {shops.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls} htmlFor="address">Indirizzo</label>
                <input id="address" name="address" required className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="city">Città</label>
                <input id="city" name="city" required className={inputCls} />
              </div>
              <div>
                <label className={labelCls} htmlFor="zip">CAP</label>
                <input id="zip" name="zip" required className={inputCls} />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="notes">Note (opzionale)</label>
            <textarea id="notes" name="notes" rows={2} className={inputCls} />
          </div>

          <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0" />

          {pointsPreview > 0 && (
            <p className="rounded-xl bg-gold/10 px-4 py-3 text-sm text-brown-950">
              Con questo ordine guadagnerai ~{pointsPreview}{" "}
              {pointsPreview === 1 ? "punto" : "punti"} fedeltà.
            </p>
          )}

          {error && <p className="text-sm font-medium text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-gold px-8 py-4 text-xs font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-gold-dark disabled:opacity-60"
          >
            {busy ? "Elaborazione…" : `Paga ${formatEuro(totalCents)}`}
          </button>
          <p className="text-center text-xs text-brown-800/60">
            Pagamento sicuro. In assenza di configurazione, l&apos;ordine viene registrato in
            modalità dimostrativa.
          </p>
        </form>
      </div>
    </section>
  );
}
