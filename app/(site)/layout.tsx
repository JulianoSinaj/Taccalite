import { ViewTransition } from "react";

import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import ScrollProgress from "@/components/site/ScrollProgress";
import SmoothScroll from "@/components/SmoothScroll";
import CookieConsent from "@/components/CookieConsent";
import Analytics from "@/components/Analytics";
import { CartProvider } from "@/components/store/cart";
import CartBar from "@/components/store/CartBar";
import CartDrawer from "@/components/store/CartDrawer";

// The shared chrome (Footer) reads shop data from the database, so every page under
// this layout must render at request time — never prerendered against an empty
// build-time DB (seeding happens at container start, not during `next build`).
export const dynamic = "force-dynamic";

/**
 * Public storefront chrome.
 *
 * `.site-shell` is what makes the paper white and swaps in Fraunces/Inter Tight;
 * it wraps this tree only, so the gestionale keeps its own ground and faces.
 *
 * The 2.6s full-screen intro animation that used to sit here is gone on purpose:
 * it blocked the first word of every visit, which is the most expensive thing a
 * shop's homepage can do.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="site-shell flex flex-1 flex-col">
        <SmoothScroll />
        <ScrollProgress />
        <SiteHeader />
        <main className="flex-1">
          {/* Replaces the old Framer AnimatePresence fade: that animated the DOM
              while the browser was trying to snapshot it for the transition, so
              the two fought. `default` names the transition class the CSS in
              globals.css targets. */}
          <ViewTransition default="page-fade">{children}</ViewTransition>
        </main>
        <SiteFooter />
        <CookieConsent />
        <CartBar />
        <CartDrawer />
        <Analytics />
      </div>
    </CartProvider>
  );
}
