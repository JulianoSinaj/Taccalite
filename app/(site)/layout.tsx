import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IntroLoader from "@/components/IntroLoader";
import SmoothScroll from "@/components/SmoothScroll";
import PageTransition from "@/components/PageTransition";
import CookieConsent from "@/components/CookieConsent";
import { CartProvider } from "@/components/store/cart";
import CartBar from "@/components/store/CartBar";

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
