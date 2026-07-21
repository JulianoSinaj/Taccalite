"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "./cart";
import { formatEuro } from "@/lib/format";

/** Slide-over mini-cart. Lists items with qty steppers, remove, subtotal and a
 *  link to checkout. Accessible: focus trap-ish (focuses close), Esc to close. */
export default function CartDrawer() {
  const { items, subtotalCents, count, setQty, remove, isOpen, close } = useCart();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Never overlay the checkout page (it renders its own cart).
  const onCheckout = pathname.startsWith("/checkout");

  // Esc to close + focus the close button when opened; lock body scroll.
  useEffect(() => {
    if (!isOpen || onCheckout) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onCheckout, close]);

  if (!isOpen || onCheckout) return null;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Il tuo carrello">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-brown-950/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-cream shadow-[0_0_60px_-10px_rgba(42,26,16,0.5)]"
      >
        <div className="flex items-center justify-between border-b border-brown-900/10 px-6 py-5">
          <h2 className="font-display flex items-center gap-2 text-2xl text-brown-950">
            <ShoppingBag className="size-5 text-gold-deep" />
            Il carrello
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="Chiudi il carrello"
            className="flex size-9 items-center justify-center rounded-full border border-brown-900/10 text-brown-900/70 transition-colors hover:bg-brown-950 hover:text-cream"
          >
            <X className="size-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-brown-900/70">Il tuo carrello è vuoto.</p>
            <Link
              href="/negozio"
              onClick={close}
              className="inline-flex rounded-full bg-gold px-6 py-3 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-gold-dark"
            >
              Vai al negozio
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
              {items.map((i) => (
                <div key={i.slug} className="flex gap-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-cream-dark">
                    {i.image ? (
                      <Image src={i.image} alt={i.name} fill className="object-cover" sizes="80px" />
                    ) : (
                      <div className="flex h-full items-center justify-center px-1 text-center text-[9px] font-bold tracking-widest text-brown-800/40 uppercase">
                        {i.name}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-lg leading-tight text-brown-950">{i.name}</p>
                      <button
                        type="button"
                        aria-label={`Rimuovi ${i.name}`}
                        onClick={() => remove(i.slug)}
                        className="text-brown-800/50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <p className="text-xs text-brown-800/60">
                      {formatEuro(i.priceCents)}
                      {i.unit ? ` / ${i.unit}` : ""}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2 rounded-full border border-brown-900/10 bg-cream-dark/50 p-1">
                        <button
                          type="button"
                          aria-label="Riduci quantità"
                          onClick={() => setQty(i.slug, i.qty - 1)}
                          className="flex size-7 items-center justify-center rounded-full bg-brown-950 text-cream"
                        >
                          <Minus className="size-3" />
                        </button>
                        <span className="w-7 text-center text-sm font-bold text-brown-950">{i.qty}</span>
                        <button
                          type="button"
                          aria-label="Aumenta quantità"
                          onClick={() => setQty(i.slug, i.qty + 1)}
                          className="flex size-7 items-center justify-center rounded-full bg-brown-950 text-cream"
                        >
                          <Plus className="size-3" />
                        </button>
                      </div>
                      <p className="font-bold text-brown-950">{formatEuro(i.priceCents * i.qty)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-brown-900/10 px-6 py-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-brown-800/80">
                  Subtotale · {count} {count === 1 ? "articolo" : "articoli"}
                </span>
                <span className="font-display text-xl font-bold text-brown-950">
                  {formatEuro(subtotalCents)}
                </span>
              </div>
              <p className="mt-1 text-xs text-brown-800/55">Spedizione calcolata al checkout.</p>
              <Link
                href="/checkout"
                onClick={close}
                className="mt-4 flex w-full items-center justify-center rounded-full bg-gold px-8 py-4 text-xs font-bold tracking-widest text-brown-950 uppercase transition-colors hover:bg-gold-dark"
              >
                Vai al checkout
              </Link>
              <button
                type="button"
                onClick={close}
                className="mt-2 w-full text-center text-xs font-semibold tracking-wide text-brown-900/60 uppercase hover:text-brown-950"
              >
                Continua lo shopping
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
