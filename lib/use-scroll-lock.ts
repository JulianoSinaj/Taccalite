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
      // Instant, not smooth: the visitor is returning to where they already were.
      window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior });
    };
  }, [active]);
}
