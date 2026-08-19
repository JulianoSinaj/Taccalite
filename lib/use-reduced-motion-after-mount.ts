"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/** No media query on the server — and React reuses this for the hydrating render. */
function getServerSnapshot() {
  return false;
}

/**
 * `useReducedMotion()`, but safe to branch the *markup* on.
 *
 * Motion's own hook reads the media query during the first client render, while
 * the server has no media query at all and always takes the motion branch. Any
 * component that returns a different tree for the two — which is most of the
 * ones on this site — therefore failed hydration for exactly the visitors who
 * asked for less motion, and React responded by discarding and re-rendering the
 * whole page.
 *
 * `useSyncExternalStore` is the fix rather than a `useState` + `useEffect` mount
 * flag: React deliberately uses `getServerSnapshot` for the hydrating render too,
 * so render one matches by construction, and the live value arrives on the next
 * commit — with no setState in an effect for the compiler to object to, and with
 * the change listener wired, so toggling the OS setting is picked up live.
 *
 * Use this wherever the reduced-motion branch changes *what is rendered*. For
 * animation values alone Motion's hook is still correct and cheaper.
 */
export function useReducedMotionAfterMount(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
