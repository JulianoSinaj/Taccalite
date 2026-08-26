"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";

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
  /** Mini-cart drawer visibility. */
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const Ctx = createContext<CartContext | null>(null);
const STORAGE_KEY = "taccalite-cart";

/**
 * The cart lives in `localStorage`, which is an external store — so it is read
 * through `useSyncExternalStore` rather than copied into state by an effect.
 *
 * The effect version set state synchronously on mount to hydrate the basket,
 * which is the cascading-render pattern the React Compiler warns about: the
 * first paint always showed an empty cart and a second render immediately
 * replaced it. `getServerSnapshot` returns the same empty array the server
 * rendered, so hydration matches by construction and React swaps in the stored
 * basket without a wasted commit.
 *
 * It also buys cross-tab consistency, which the effect could not: two open tabs
 * each kept their own copy and the last one to write silently won.
 */
const EMPTY: CartItem[] = [];

let cache: CartItem[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): CartItem[] {
  if (!raw) return EMPTY;
  try {
    const v: unknown = JSON.parse(raw);
    // A hand-edited or half-written key must not take the storefront down.
    return Array.isArray(v) ? (v as CartItem[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function readStored(): CartItem[] {
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private mode, or storage disabled: an in-memory cart still works.
    return EMPTY;
  }
}

/** Cached, so the snapshot is reference-stable — re-reading and re-parsing on
 *  every render would hand React a new array each time and never settle. */
function getSnapshot(): CartItem[] {
  if (!loaded) {
    cache = readStored();
    loaded = true;
  }
  return cache;
}

function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab wrote the basket: adopt it rather than overwrite it later.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return;
    cache = readStored();
    loaded = true;
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function update(fn: (prev: CartItem[]) => CartItem[]): void {
  const next = fn(getSnapshot());
  cache = next;
  loaded = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the cart still works for this session */
  }
  emit();
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isOpen, setIsOpen] = useState(false);

  const api = useMemo<CartContext>(() => {
    return {
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotalCents: items.reduce((n, i) => n + i.priceCents * i.qty, 0),
      add: (item, qty = 1) =>
        update((prev) => {
          const found = prev.find((i) => i.slug === item.slug);
          if (found) return prev.map((i) => (i.slug === item.slug ? { ...i, qty: i.qty + qty } : i));
          return [...prev, { ...item, qty }];
        }),
      setQty: (slug, qty) =>
        update((prev) =>
          qty <= 0 ? prev.filter((i) => i.slug !== slug) : prev.map((i) => (i.slug === slug ? { ...i, qty } : i)),
        ),
      remove: (slug) => update((prev) => prev.filter((i) => i.slug !== slug)),
      clear: () => update(() => EMPTY),
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    };
  }, [items, isOpen]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCart(): CartContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
