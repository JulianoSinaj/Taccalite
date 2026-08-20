"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A media query as React state, safe to branch markup on.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the server has no
 * media query at all, so the server snapshot is the honest `false` and React
 * reuses it for the hydrating render instead of tearing the tree. Anything that
 * differs between the two renders must therefore treat `false` as its
 * server-side default — for a breakpoint that means writing the *narrow* case
 * as the fallback, which is the right default on a site most visitors reach
 * from a phone anyway.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
