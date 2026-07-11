# Routes — Norcineria Taccalite

Framework: **Next.js 16 (App Router)** · React 19 · Tailwind CSS v4 · shadcn/ui (Radix) · motion (Framer Motion) · Lenis · React Three Fiber

File-based routing under `app/`. All pages share the root layout (`app/layout.tsx`) which wraps every page with IntroLoader, SmoothScroll, MagneticCursor, Header, PageTransition and Footer.

| URL | Page component | Notes |
| --- | --- | --- |
| `/` | `app/page.tsx` | Home. ScrollIntroSequence (400vh pinned cinematic intro) + Hero + shops grid + porchetta band + products + blog preview + CTA cards |
| `/negozi` | `app/negozi/page.tsx` | Shop listing: SectionHeading + 2 ShopCards |
| `/negozi/[slug]` | `app/negozi/[slug]/page.tsx` | Shop detail (`centro`, `carni`). Hero w/ medallion + info sidebar + products + cross-link |
| `/porchetta` | `app/porchetta/page.tsx` | Porchetta storytelling: Hero + 3-step process cards + dark "sabato" band |
| `/blog` | `app/blog/page.tsx` | News listing: SectionHeading + BlogCard grid |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | Article: back link, date, title, Photo, paragraphs (max-w-3xl) |
| `/prenotazioni` | `app/prenotazioni/page.tsx` | Table reservation: SectionHeading + ReservationForm (max-w-3xl) |
| `/account` | `app/account/page.tsx` | Area personale: SectionHeading + AccountArea (login/register tabs → LoyaltyCard), max-w-2xl |
| `POST /api/prenotazioni` | `app/api/prenotazioni/route.ts` | Stub endpoint validating reservation payload |

## Root layout (`app/layout.tsx`) — full source

```tsx
import type { Metadata } from "next";
import { Playfair_Display, Open_Sans } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IntroLoader from "@/components/IntroLoader";
import SmoothScroll from "@/components/SmoothScroll";
import MagneticCursor from "@/components/MagneticCursor";
import PageTransition from "@/components/PageTransition";
import { cn } from "@/lib/utils";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Norcineria Taccalite — Ancona dal 1946",
  description:
    "Norcineria Taccalite: formaggi, salumi, carni selezionate e la nostra porchetta artigianale. Due negozi nel cuore di Ancona.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={cn("h-full", playfair.variable, openSans.variable, "font-sans")}>
      <body className="flex min-h-full flex-col antialiased">
        <IntroLoader />
        <SmoothScroll />
        <MagneticCursor />
        <Header />
        <main className="flex-1">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </body>
    </html>
  );
}
```

## Real photos available (`public/images/`)
- `/images/home-hero-gastronomia.jpg` — gastronomia counter (home hero + intro sequence main frame)
- `/images/negozio-centro-formaggi.jpg` — cheese counter, Centro shop
- `/images/negozio-carni-prosciutto.jpg` — meat/prosciutto counter, Mercato del Piano shop
- `/images/shop-shelves-prodotti.jpg` — product shelves

All other imagery uses `ImagePlaceholder` (labelled gradient block) until real photography is supplied.
