import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IntroLoader from "@/components/IntroLoader";
import SmoothScroll from "@/components/SmoothScroll";
import PageTransition from "@/components/PageTransition";
import CookieConsent from "@/components/CookieConsent";
import { CartProvider } from "@/components/store/cart";
import CartBar from "@/components/store/CartBar";

// The shared chrome (Footer) reads shop data from the database, so every page under
// this layout must render at request time — never prerendered against an empty
// build-time DB (seeding happens at container start, not during `next build`).
export const dynamic = "force-dynamic";

/** Public marketing site chrome (3D intro, smooth scroll, header/footer, consent). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <IntroLoader />
      <SmoothScroll />
      <Header />
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
      <CookieConsent />
      <CartBar />
    </CartProvider>
  );
}
