"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * `useLayoutEffect` is the right hook below — it has to run in the same commit
 * as the router's own scroll reset, not a paint later — but React logs a warning
 * for it during the server render this client component still gets.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Hand Lenis' bookkeeping back to whatever the DOM actually says.
 *
 * `stop()` immediately followed by `start()` is the public way to reach Lenis'
 * private `reset()`: both call it, and the pair leaves the instance running.
 * `reset()` kills the in-flight animation and sets Lenis' internal position to
 * the real one — it never moves the page itself, which is exactly what is wanted
 * here: the router decides where the new page starts, this only stops Lenis
 * arguing with it.
 */
function adoptDomScroll(lenis: Lenis) {
  lenis.stop();
  lenis.start();
}

export default function SmoothScroll() {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const lenis = new Lenis({
      duration: 1.3,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
    });
    lenisRef.current = lenis;

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  /**
   * Why a new page used to open halfway down.
   *
   * The App Router sends every navigation back to the top by assigning
   * `document.documentElement.scrollTop = 0` from a layout effect — a plain
   * native scroll. Lenis ignores native scrolls while its own smooth animation
   * is mid-flight (`isScrolling === 'smooth'`), so it never noticed the reset and
   * kept easing towards the offset the visitor had wheeled to on the *previous*
   * page, dragging the new one back down with it. The window is `duration`
   * seconds — 1.3 here — after the last wheel tick, which is precisely how long
   * it takes to stop scrolling and reach for a link in the header, so the bug
   * fired on most navigations made from anywhere but the top of a page.
   *
   * Syncing on the pathname is enough for the header, the footer and every other
   * in-page link; a search-params-only change (the shop's filters, its paging)
   * does not re-render this component and does not need to, since those keep the
   * visitor where they were on purpose.
   */
  useIsomorphicLayoutEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;

    // Once now, so nothing is ever painted at the old offset...
    adoptDomScroll(lenis);

    // ...and once more after the frame, because the router's reset is only the
    // first of the things that move a new page: a `#hash` target scrolls itself
    // into view, and the browser restores its own offset on back/forward. This
    // also closes the one-frame hole where Lenis is deaf to the next native
    // scroll event (it mutes itself for a frame whenever an animation ends).
    const frame = requestAnimationFrame(() => adoptDomScroll(lenis));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
