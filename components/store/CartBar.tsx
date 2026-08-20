"use client";

import { usePathname } from "next/navigation";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { useCart } from "./cart";
import { formatEuro } from "@/lib/format";

/** Floating cart summary shown when the cart has items (hidden on checkout).
 *  Clicking it opens the mini-cart drawer instead of jumping to checkout. */
export default function CartBar() {
  const { count, subtotalCents, open } = useCart();
  const pathname = usePathname();

  if (count === 0 || pathname.startsWith("/checkout")) return null;

  return (
    // `bottom-safe-stack` keeps it clear of the home indicator *and* of the
    // cookie bar, which on a phone wraps to three lines and used to cover this
    // control completely on a first visit (see globals.css).
    <div
      data-cartbar
      className="bottom-safe-stack fixed inset-x-0 z-[70] flex justify-center px-[max(1rem,env(safe-area-inset-left))]"
    >
      <button
        type="button"
        onClick={open}
        aria-label="Apri il carrello"
        className="flex w-full max-w-md items-center gap-3 rounded-full bg-brown-950 py-2.5 pr-2.5 pl-5 text-cream shadow-[0_20px_50px_-15px_rgba(42,26,16,0.6)] transition-transform hover:-translate-y-0.5 sm:w-auto sm:gap-4 sm:py-3 sm:pr-3"
      >
        <ShoppingBag className="size-5 shrink-0 text-gold" aria-hidden />
        {/* `min-w-0` + `truncate`: at 320px "3 articoli · €124,50" and the pill
            together are wider than the screen, and without a shrinkable middle
            the flex row pushed the call to action off the right edge. */}
        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold sm:flex-none">
          {count} {count === 1 ? "articolo" : "articoli"} · {formatEuro(subtotalCents)}
        </span>
        <span className="flex shrink-0 items-center gap-2 rounded-full bg-gold px-4 py-2.5 text-[0.6875rem] font-bold tracking-[0.14em] text-on-gold uppercase">
          {/* The word is the affordance on a desktop; on the narrowest phones
              the arrow says the same thing in a third of the width, and the
              price row is what needs the space. */}
          <span className="hidden min-[380px]:inline">Vedi carrello</span>
          <span className="min-[380px]:hidden">Carrello</span>
          <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </button>
    </div>
  );
}
