"use client";

import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { useCart, type CartItem } from "./cart";

type Props = {
  product: Omit<CartItem, "qty">;
  /** Stock level: 0 = out of stock, null = unlimited. */
  stock?: number | null;
  /** Show a −/N/+ quantity stepper before the add button. */
  withQuantity?: boolean;
};

export default function AddToCartButton({ product, stock, withQuantity = false }: Props) {
  const { add, open } = useCart();
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);

  const soldOut = stock === 0;

  if (soldOut) {
    return (
      <button
        type="button"
        disabled
        aria-disabled
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-rule-strong bg-brown-900/5 px-6 py-4 text-xs font-bold tracking-widest text-taupe uppercase"
      >
        Esaurito
      </button>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {withQuantity && (
        <div className="flex items-center justify-center gap-2 rounded-full border border-rule bg-paper-warm/50 p-1.5">
          <button
            type="button"
            aria-label="Riduci quantità"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            className="flex size-11 items-center justify-center rounded-full bg-brown-950 text-cream transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            <Minus className="size-4" />
          </button>
          <span
            className="w-12 text-center text-lg font-bold text-brown-950 tabular-nums"
            aria-live="polite"
          >
            {qty}
          </span>
          <button
            type="button"
            aria-label="Aumenta quantità"
            onClick={() => setQty((q) => (stock != null ? Math.min(stock, q + 1) : q + 1))}
            disabled={stock != null && qty >= stock}
            className="flex size-11 items-center justify-center rounded-full bg-brown-950 text-cream transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          add(product, withQuantity ? qty : 1);
          setAdded(true);
          open();
          setTimeout(() => setAdded(false), 1200);
        }}
        // `py-4` rather than `py-3`: this is the one control on the page that
        // completes the visit, and at 40px tall it was the same height as a
        // secondary link on a phone.
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brown-950 px-6 py-4 text-xs font-bold tracking-widest text-cream uppercase transition-colors hover:bg-gold hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {added ? <Check className="size-4" /> : <Plus className="size-4" />}
        {added ? "Aggiunto" : "Aggiungi"}
      </button>
    </div>
  );
}
