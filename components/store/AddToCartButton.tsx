"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useCart, type CartItem } from "./cart";

export default function AddToCartButton({ product }: { product: Omit<CartItem, "qty"> }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        add(product);
        setAdded(true);
        setTimeout(() => setAdded(false), 1200);
      }}
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brown-950 px-6 py-3 text-xs font-bold tracking-widest text-cream uppercase transition-colors hover:bg-gold hover:text-brown-950"
    >
      {added ? <Check className="size-4" /> : <Plus className="size-4" />}
      {added ? "Aggiunto" : "Aggiungi"}
    </button>
  );
}
