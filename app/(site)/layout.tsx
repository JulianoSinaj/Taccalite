import { ViewTransition } from "react";

import { getShops } from "@/lib/db/queries";
import Intro from "@/components/site/Intro";
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
 * `<Intro />` is a full-screen veil, which this layout used to have and lost on
 * purpose — the old one ran 2.6s and blocked the first word of every visit, the
 * most expensive thing a shop's homepage can do. The one here is a different
 * animal and the differences are the whole point: it plays once per session, on
 * a hard load of the homepage only, and it lifts on a hard cap of 1.2s whatever
 * is still in flight. Keep those three properties or take it out again.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Only for the phone menu's "chiama la bottega" rows — the numbers belong to
  // the shops table, so they are read from it rather than restated as constants.
  // `getShops` is React-cached, so the footer's own call costs nothing extra.
  const shops = await getShops();

  return (
    <CartProvider>
      <div className="site-shell flex flex-1 flex-col">
        {/* First child on purpose. Its inline script has to be parsed before the
            browser has any of the page to paint — see components/site/Intro.tsx.
            The veil itself only ever shows on a hard load of "/". */}
        <Intro />
        <SmoothScroll />
        <ScrollProgress />
        <SiteHeader
          shops={shops.map((shop) => ({ slug: shop.slug, name: shop.name, phone: shop.phone }))}
        />
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
