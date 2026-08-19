"use client";

import { useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import { useCart, type CartItem } from "@/components/store/cart";
import { cn } from "@/lib/utils";

type QuickAddProps = {
  product: Omit<CartItem, "qty">;
  /** 0 = out of stock. Null = made to order, no limit. */
  stock?: number | null;
  className?: string;
};

/**
 * Add to the cart straight from a grid tile, without opening the product.
 *
 * Sits over the photograph and only appears on hover, so a page of tiles stays
 * a page of products rather than a page of buttons. Pointer-coarse devices have
 * no hover to reveal it with, so there it is simply always visible.
 */
export default function QuickAdd({ product, stock, className }: QuickAddProps) {
  const { add, open } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (stock === 0) return null;

  function handleAdd() {
    add(product, 1);
    setAdded(true);
    open();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      aria-label={`Aggiungi ${product.name} al carrello`}
      className={cn(
        "flex items-center justify-center gap-2 rounded-full bg-paper/95 px-5 py-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-brown-950 uppercase backdrop-blur-sm",
        "shadow-[0_6px_20px_-8px_rgba(42,26,16,0.45)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:bg-brown-950 hover:text-cream",
        "focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none",
        // Hidden until the tile is hovered or something inside it takes focus.
        "translate-y-2 opacity-0",
        "group-hover:translate-y-0 group-hover:opacity-100",
        "group-focus-within:translate-y-0 group-focus-within:opacity-100",
        "focus-visible:translate-y-0 focus-visible:opacity-100",
        // No hover on touch: reveal-on-hover would make it unreachable.
        "[@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100",
        className
      )}
    >
      {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      {added ? "Aggiunto" : "Aggiungi"}
    </button>
  );
}
