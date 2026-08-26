import { ViewTransition } from "react";

import { getShops } from "@/lib/db/queries";
import { INTRO_GATE_SCRIPT } from "@/lib/intro";
import InlineScript from "@/components/InlineScript";
import IntroLoader from "@/components/IntroLoader";
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
 * `<IntroLoader />` is the original brown cinematic intro — the gold ring, the
 * name, the rule — brought back after a spell as a white paper veil. It plays on
 * the first hard load of a tab and never again in it, and never on a soft
 * navigation (this layout does not remount). Its length is `TOTAL_DURATION` in
 * the component; it holds the page still while it is up, and "Salta" ends it
 * early.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Only for the phone menu's "chiama la bottega" rows — the numbers belong to
  // the shops table, so they are read from it rather than restated as constants.
  // `getShops` is React-cached, so the footer's own call costs nothing extra.
  const shops = await getShops();

  return (
    <CartProvider>
      <div className="site-shell flex flex-1 flex-col">
        {/* Decides whether this load gets the intro at all, and must do it before
            the parser reaches the curtain below — so it is inline and blocking,
            not an effect. See lib/intro.ts. */}
        <InlineScript html={INTRO_GATE_SCRIPT} />
        {/* First child after the gate so its curtain is in the server HTML ahead
            of everything it covers — see components/IntroLoader.tsx. */}
        <IntroLoader />
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
