"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartItem = {
  slug: string;
  name: string;
  priceCents: number;
  unit: string | null;
  image: string;
  qty: number;
};

type CartContext = {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartContext | null>(null);
const STORAGE_KEY = "taccalite-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const api = useMemo<CartContext>(() => {
    return {
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotalCents: items.reduce((n, i) => n + i.priceCents * i.qty, 0),
      add: (item, qty = 1) =>
        setItems((prev) => {
          const found = prev.find((i) => i.slug === item.slug);
          if (found) return prev.map((i) => (i.slug === item.slug ? { ...i, qty: i.qty + qty } : i));
          return [...prev, { ...item, qty }];
        }),
      setQty: (slug, qty) =>
        setItems((prev) =>
          qty <= 0 ? prev.filter((i) => i.slug !== slug) : prev.map((i) => (i.slug === slug ? { ...i, qty } : i)),
        ),
      remove: (slug) => setItems((prev) => prev.filter((i) => i.slug !== slug)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
