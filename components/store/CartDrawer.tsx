"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import ProductPlate from "@/components/site/ProductPlate";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "./cart";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatEuro } from "@/lib/format";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Slide-over mini-cart. Lists items with qty steppers, remove, subtotal and a
 *  link to checkout. Accessible: focus trap-ish (focuses close), Esc to close. */
export default function CartDrawer() {
  const { items, subtotalCents, count, setQty, remove, isOpen, close } = useCart();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  // Matches the `sm:` breakpoint the panel's own classes switch at, so the
  // travel direction and the edge it is anchored to never disagree.
  const asDrawer = useMediaQuery("(min-width: 40rem)");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Never overlay the checkout page (it renders its own cart).
  const onCheckout = pathname.startsWith("/checkout");
  const active = isOpen && !onCheckout;

  useScrollLock(active);

  // Esc to close + focus the close button when opened.
  useEffect(() => {
    if (!active) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, close]);

  return (
    <AnimatePresence>
      {active && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label="Il tuo carrello">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-brown-950/50 backdrop-blur-sm"
            onClick={close}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />

          {/* Panel.
           *
           * A sheet rising from the bottom edge on a phone, a drawer from the
           * right above `sm`. Not a style choice: the drawer's controls — close,
           * the steppers, the checkout button — all sat in the top two thirds of
           * a 6-inch screen, which is the part of it a thumb cannot reach while
           * holding the phone. Rising from the bottom puts the primary action
           * under the thumb and the dismissal within reach of it.
           *
           * `max-h-[88svh]`, in small viewport units: `vh` on iOS is measured
           * with the browser chrome *hidden*, so a sheet sized in `vh` extends
           * under the address bar and buries its own checkout button until the
           * page happens to scroll. `svh` is the height that is always visible.
           */}
          <motion.div
            ref={panelRef}
            className="pb-safe absolute inset-x-0 bottom-0 flex max-h-[88svh] flex-col bg-cream shadow-[0_0_60px_-10px_rgba(42,26,16,0.5)] sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-full sm:max-w-md"
            initial={
              reduceMotion ? { opacity: 0 } : asDrawer ? { x: "100%" } : { y: "100%" }
            }
            animate={reduceMotion ? { opacity: 1 } : { x: 0, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : asDrawer ? { x: "100%" } : { y: "100%" }}
            transition={{ duration: 0.42, ease: EASE }}
          >
            {/* The grabber. It does nothing — the sheet is not draggable — but it
                is the mark that tells a phone user this panel came from the
                bottom edge and goes back to it. */}
            <span
              aria-hidden
              className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-brown-950/15 sm:hidden"
            />

            <div className="flex shrink-0 items-center justify-between border-b border-rule px-5 py-4 sm:px-6 sm:py-5">
              <h2 className="font-display flex items-center gap-2 text-2xl text-brown-950">
                <ShoppingBag className="size-5 text-gold-deep" aria-hidden />
                Il carrello
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Chiudi il carrello"
                className="-mr-1.5 flex size-11 items-center justify-center rounded-full border border-rule text-brown-700 transition-colors hover:bg-brown-950 hover:text-cream focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
              >
                <X className="size-4" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                <p className="text-brown-700">Il tuo carrello è vuoto.</p>
                <Link
                  href="/negozio"
                  onClick={close}
                  className="inline-flex rounded-full bg-gold px-6 py-3.5 text-xs font-bold tracking-widest text-brown-950 uppercase hover:bg-gold-dark"
                >
                  Vai al negozio
                </Link>
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
                  {items.map((i) => (
                    <div key={i.slug} className="flex gap-4">
                      <div className="relative size-20 shrink-0 overflow-hidden bg-paper-warm">
                        {i.image ? (
                          <Image src={i.image} alt={i.name} fill className="object-cover" sizes="80px" />
                        ) : (
                          // The shop's plate at thumbnail size — the initial only.
                          // The name set in 9px capitals wrapped to four lines and
                          // was unreadable at 80px anyway.
                          <ProductPlate name={i.name} category="" seed={i.slug} size="sm" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-lg leading-tight text-brown-950">{i.name}</p>
                          <button
                            type="button"
                            aria-label={`Rimuovi ${i.name}`}
                            onClick={() => remove(i.slug)}
                            // `tap` grows the target to 44px without growing the
                            // 16px glyph, which would read as a heavier mark than
                            // "remove one line" deserves.
                            className="tap -mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center text-taupe transition-colors hover:text-danger focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <p className="text-xs text-taupe">
                          {formatEuro(i.priceCents)}
                          {i.unit ? ` / ${i.unit}` : ""}
                        </p>
                        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                          <div className="flex items-center gap-1 rounded-full border border-rule bg-paper-warm/50 p-1">
                            <button
                              type="button"
                              aria-label="Riduci quantità"
                              onClick={() => setQty(i.slug, i.qty - 1)}
                              className="flex size-9 items-center justify-center rounded-full bg-brown-950 text-cream focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                            >
                              <Minus className="size-3.5" />
                            </button>
                            <span className="w-8 text-center text-sm font-bold text-brown-950 tabular-nums">
                              {i.qty}
                            </span>
                            <button
                              type="button"
                              aria-label="Aumenta quantità"
                              onClick={() => setQty(i.slug, i.qty + 1)}
                              className="flex size-9 items-center justify-center rounded-full bg-brown-950 text-cream focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                          <p className="font-bold text-brown-950 tabular-nums">
                            {formatEuro(i.priceCents * i.qty)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="shrink-0 border-t border-rule px-5 py-4 sm:px-6 sm:py-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-brown-700">
                      Subtotale · {count} {count === 1 ? "articolo" : "articoli"}
                    </span>
                    <span className="font-display text-xl font-bold text-brown-950 tabular-nums">
                      {formatEuro(subtotalCents)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-taupe">Spedizione calcolata al checkout.</p>
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
                    className="mt-1 w-full py-3 text-center text-xs font-semibold tracking-wide text-brown-700 uppercase hover:text-brown-950"
                  >
                    Continua lo shopping
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
