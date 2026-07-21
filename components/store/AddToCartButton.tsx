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
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-brown-900/15 bg-brown-900/5 px-6 py-3 text-xs font-bold tracking-widest text-brown-900/50 uppercase"
      >
        Esaurito
      </button>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {withQuantity && (
        <div className="flex items-center justify-center gap-2 rounded-full border border-brown-900/10 bg-cream-dark/50 p-1">
          <button
            type="button"
            aria-label="Riduci quantità"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brown-950 text-cream disabled:opacity-40"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-10 text-center font-bold text-brown-950" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            aria-label="Aumenta quantità"
            onClick={() => setQty((q) => (stock != null ? Math.min(stock, q + 1) : q + 1))}
            disabled={stock != null && qty >= stock}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brown-950 text-cream disabled:opacity-40"
          >
            <Plus className="size-3.5" />
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
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brown-950 px-6 py-3 text-xs font-bold tracking-widest text-cream uppercase transition-colors hover:bg-gold hover:text-brown-950"
      >
        {added ? <Check className="size-4" /> : <Plus className="size-4" />}
        {added ? "Aggiunto" : "Aggiungi"}
      </button>
    </div>
  );
}
