import type { Metadata, Viewport } from "next";
import { Playfair_Display, Open_Sans, Fraunces, Inter_Tight } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";
import { env } from "@/lib/env";

// The gestionale's faces. The storefront moved to Fraunces/Inter Tight below, but
// the admin keeps these deliberately: retyping an internal tool nobody asked to
// change is risk without a payoff.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// The storefront's faces. Fraunces is a variable serif whose `SOFT`/`WONK` axes
// give the headlines a slightly hand-cut edge — the point of the swap was to stop
// reading as the default Playfair/Open Sans pairing every other site uses.
//
// Both are variable, so `weight` is left off entirely — next/font then serves the
// whole variable face (its generated types only accept discrete weights or the
// literal "variable", never a range string). That is what keeps the axes below
// available. `WONK` replaces italic as the emphasis treatment: it swaps in
// Fraunces' quirky alternates, which is more characteristic than a slant and
// saves loading a second font file.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: "Norcineria Taccalite — Ancona dal 1946",
    template: "%s — Norcineria Taccalite",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "norcineria",
    "porchetta",
    "Ancona",
    "salumi",
    "formaggi",
    "ciauscolo",
    "Marche",
    "gastronomia",
  ],
  authors: [{ name: siteConfig.name }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: "Norcineria Taccalite — Ancona dal 1946",
    description: siteConfig.description,
    url: env.siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Norcineria Taccalite — Ancona dal 1946",
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
};

/**
 * `viewport-fit=cover` is what makes `env(safe-area-inset-*)` resolve to
 * anything other than zero.
 *
 * Without it iOS letterboxes the page inside the safe area: nothing is ever
 * hidden, but the notch and the home-indicator strip are painted in a flat band
 * that does not belong to the design — a white bar under a brown footer, a grey
 * one under a full-bleed photograph. With it the page reaches both edges and the
 * insets become real numbers, which the fixed chrome (header, cookie bar, cart
 * bar, buy bar, cart sheet) already pads itself by via `.pb-safe` / `.px-safe`
 * in globals.css. The two halves only work together — this is the other half.
 *
 * `themeColor` tints Safari's and Chrome's own address bar to the paper, so the
 * top of the screen stops being a grey strip above a warm-white page.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fdfaf5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      // The storefront's inline intro-gate script (`lib/intro.ts`) sets
      // `data-intro` on this element before hydration, outside React's
      // control, so the SSR/client attributes never match here by design.
      suppressHydrationWarning
      className={cn(
        playfair.variable,
        openSans.variable,
        fraunces.variable,
        interTight.variable,
        "font-sans"
      )}
    >
      <body className="flex min-h-svh flex-col antialiased">{children}</body>
    </html>
  );
}
