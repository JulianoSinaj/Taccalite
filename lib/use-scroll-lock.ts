"use client";

import { useEffect } from "react";

/**
 * Freeze the page behind a full-screen overlay.
 *
 * `overflow: hidden` on `<body>` is the usual answer, and on a phone it is not
 * enough: iOS Safari stops the *document* scrolling but keeps rubber-banding the
 * visual viewport, so a drag started on the cart drawer or the nav overlay
 * scrolls the page underneath it and slides the overlay off the top of the
 * screen. Pinning the body at its current offset with `position: fixed` is what
 * actually holds it, and restoring the offset on release is what stops the page
 * jumping back to the top when the overlay closes.
 *
 * The pinning is applied only on a coarse pointer, on purpose. Lenis drives
 * desktop scrolling by calling `window.scrollTo` every frame; taking the body
 * out of flow underneath it makes those calls no-ops and leaves Lenis's internal
 * position out of step with the real one, which lands as a jump on close. Touch
 * scrolling is native — Lenis's `syncTouch` is off — so there is nothing to
 * fight there, and `overflow: hidden` alone remains correct on the desktop.
 *
 * The restore is skipped when the overlay closed *because* of a navigation.
 * Every overlay that uses this hook shuts itself on a path change — the phone
 * menu and the admin drawer both do it during render, the cart sheet does it by
 * way of `/checkout` — so on a phone, tapping any link inside one released the
 * lock in the same commit that painted the new page, and the restore then put
 * the visitor's *old* offset on it. Tapping "Sedi" from halfway down the home
 * page opened /sedi 1200px down, every single time.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!coarse) {
      return () => {
        body.style.overflow = previousOverflow;
      };
    }

    const scrollY = window.scrollY;
    // Read from `location` rather than `usePathname()`: this has to be compared
    // against the path as it is *when the lock releases*, and a value React
    // closed over at render time is by definition the old one. The router has
    // already pushed the new URL by the time the cleanup below runs.
    const lockedPath = window.location.pathname;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    return () => {
      body.style.overflow = previousOverflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      // Only when the page underneath is still the one that was pinned: if it is
      // not, the router has already put the new page where it belongs and this
      // would drag it back down to an offset that means nothing on it.
      if (window.location.pathname !== lockedPath) return;
      // Instant, not smooth: the visitor is returning to where they already were.
      window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior });
    };
  }, [active]);
}
