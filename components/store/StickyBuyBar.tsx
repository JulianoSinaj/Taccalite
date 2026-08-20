"use client";

import { useState } from "react";
import { Check, Plus, ShoppingBag } from "lucide-react";
import { useCart, type CartItem } from "./cart";
import { formatEuro } from "@/lib/format";

type Props = {
  product: Omit<CartItem, "qty">;
  /** 0 = out of stock, null = made to order. */
  stock?: number | null;
  /**
   * Whether the in-page buy block has scrolled off. Decided by `ProductBuy`,
   * which owns the ref to it — the bar exists only to stand in for that block,
   * and the two must never be on screen asking for the same tap.
   */
  visible: boolean;
};

/**
 * The buy action, pinned to the bottom of a phone screen.
 *
 * A product page is a photograph, a name, a price, three paragraphs and then —
 * eventually — a button. On a desktop all of that is one glance because the
 * details column sits beside the picture. On a phone the column stacks *under*
 * a full-width square photograph, so the one control that completes the visit
 * starts life below the fold and goes further below it the more the shop has to
 * say about the product. This is the standard answer, and it is standard because
 * it is the only one that keeps "add to cart" one thumb-length away at every
 * scroll position.
 *
 * Phones only (`lg:hidden`): above that breakpoint the button is already beside
 * the photograph and a second copy of it would be noise.
 */
export default function StickyBuyBar({ product, stock, visible }: Props) {
  const { add, open, count } = useCart();
  const [added, setAdded] = useState(false);

  const soldOut = stock === 0;

  function handleAdd() {
    add(product, 1);
    setAdded(true);
    open();
    setTimeout(() => setAdded(false), 1200);
  }

  return (
    <div
      data-buybar={visible ? "" : undefined}
      aria-hidden={!visible}
      className={`pb-safe px-safe fixed inset-x-0 bottom-0 z-[70] border-t border-rule bg-paper/95 backdrop-blur-xl transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
      style={{ bottom: "var(--consent-h, 0px)" }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] leading-tight font-medium text-brown-950">
            {product.name}
          </p>
          <p className="mt-0.5 text-[0.9375rem] leading-none font-semibold text-brown-950 tabular-nums">
            {formatEuro(product.priceCents)}
            {product.unit && <span className="text-xs font-normal text-taupe"> / {product.unit}</span>}
          </p>
        </div>

        {count > 0 && (
          <button
            type="button"
            onClick={open}
            aria-label={`Carrello, ${count} articoli`}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-rule-strong text-brown-700 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            <ShoppingBag className="size-[1.05rem]" aria-hidden />
            <span className="absolute -top-1 -right-1 flex min-w-[1.15rem] items-center justify-center rounded-full bg-brown-950 px-1 text-[0.625rem] font-bold text-cream tabular-nums">
              {count}
            </span>
          </button>
        )}

        {soldOut ? (
          <span className="shrink-0 rounded-full border border-rule-strong px-5 py-3.5 text-[0.6875rem] font-bold tracking-[0.14em] text-taupe uppercase">
            Esaurito
          </span>
        ) : (
          <button
            type="button"
            onClick={handleAdd}
            tabIndex={visible ? undefined : -1}
            className="flex shrink-0 items-center gap-2 rounded-full bg-brown-950 px-5 py-3.5 text-[0.6875rem] font-bold tracking-[0.14em] text-cream uppercase focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {added ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
            {added ? "Aggiunto" : "Aggiungi"}
          </button>
        )}
      </div>
    </div>
  );
}
