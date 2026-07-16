"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart";
import { formatEuro } from "@/lib/format";

/** Floating cart summary shown when the cart has items (hidden on checkout). */
export default function CartBar() {
  const { count, subtotalCents } = useCart();
  const pathname = usePathname();

  if (count === 0 || pathname.startsWith("/checkout")) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4">
      <Link
        href="/checkout"
        className="flex items-center gap-4 rounded-full bg-brown-950 py-3 pl-5 pr-3 text-cream shadow-[0_20px_50px_-15px_rgba(42,26,16,0.6)] transition-transform hover:-translate-y-0.5"
      >
        <ShoppingBag className="size-5 text-gold" />
        <span className="text-sm font-semibold">
          {count} {count === 1 ? "articolo" : "articoli"} · {formatEuro(subtotalCents)}
        </span>
        <span className="rounded-full bg-gold px-4 py-2 text-[11px] font-bold tracking-widest text-brown-950 uppercase">
          Checkout
        </span>
      </Link>
    </div>
  );
}
