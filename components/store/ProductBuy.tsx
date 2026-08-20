"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AddToCartButton from "./AddToCartButton";
import StickyBuyBar from "./StickyBuyBar";
import { useMediaQuery } from "@/lib/use-media-query";
import type { CartItem } from "./cart";

type Props = {
  product: Omit<CartItem, "qty">;
  /** 0 = out of stock, null = made to order. */
  stock?: number | null;
  /** Rendered under the buy block when the product is out of stock. */
  children?: React.ReactNode;
};

/**
 * The buy block on a product page, plus the bar that stands in for it once it
 * scrolls off a phone screen.
 *
 * The two are one component because they are one control: the bar exists only
 * to say "the button is still here", and it needs to know exactly when the real
 * button left the viewport. An id and `getElementById` would have been the
 * smaller change and it does not survive contact with streaming — Next leaves a
 * second, zero-sized copy of not-yet-placed markup in a `div#S:0` at the end of
 * `<body>`, so the page genuinely has two elements carrying the anchor id and
 * the observer has a 50/50 chance of watching the invisible one, which never
 * intersects anything and never fires again. A ref cannot be pointed at the
 * wrong copy.
 *
 * The bar is portalled to `<body>` so that no ancestor's `transform`, `filter`
 * or `backdrop-filter` can turn it into a containing block and drop a `fixed`
 * element into the middle of the page.
 */
export default function ProductBuy({ product, stock, children }: Props) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  /**
   * Doubles as the "are we on the client yet" gate — `createPortal` cannot run
   * during SSR, and the media query's server snapshot is `false`, so the first
   * render on both sides agrees on "no bar" and React swaps it in after
   * hydration. A `useState` + `useEffect(() => setMounted(true))` would say the
   * same thing and trips the React Compiler's set-state-in-effect rule.
   *
   * Matches the bar's own `lg:hidden`: above that width the buy button already
   * sits beside the photograph and a second copy of it is noise.
   */
  const onPhone = useMediaQuery("(max-width: 63.999rem)");

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // `top < 0` distinguishes "scrolled past it" from "not yet scrolled down
        // to it": without the test the bar also shows on first paint, while the
        // real button is one screen below — the moment it is least useful and
        // most in the way of the photograph.
        setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { rootMargin: "0px 0px -20% 0px" }
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={anchorRef} className="mt-8 max-w-sm lg:max-w-xs">
        <AddToCartButton product={product} stock={stock} withQuantity />
        {children}
      </div>

      {onPhone &&
        createPortal(
          <StickyBuyBar product={product} stock={stock} visible={scrolledPast} />,
          document.body
        )}
    </>
  );
}
