# Layouts — Norcineria Taccalite

Shared chrome rendered on **every** page by `app/layout.tsx` (see routes.md for the layout itself): `IntroLoader` → `SmoothScroll` → `MagneticCursor` → `Header` → `<main><PageTransition>{page}</PageTransition></main>` → `Footer`.

## Header — `components/Header.tsx`

Sticky cream top bar with wordmark, 5 nav links, "Area Personale" pill, hamburger → dropdown below `lg`.

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/negozi", label: "I Nostri Negozi" },
  { href: "/porchetta", label: "La Porchetta" },
  { href: "/blog", label: "News" },
  { href: "/prenotazioni", label: "Prenota un Tavolo" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-brown-700/15 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tracking-tight text-brown-900">
            Taccalite
          </span>
          <span className="hidden text-xs tracking-wide text-taupe uppercase sm:inline">
            Norcineria dal 1946
          </span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-brown-900 ${
                  active ? "text-brown-900" : "text-brown-800/70"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/account"
            className="rounded-full border border-brown-800 px-4 py-1.5 text-sm font-medium text-brown-900 transition-colors hover:bg-brown-900 hover:text-cream"
          >
            Area Personale
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Apri il menu"
          aria-expanded={open}
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5 lg:hidden"
        >
          <span
            className={`block h-0.5 w-6 bg-brown-900 transition-transform ${open ? "translate-y-2 rotate-45" : ""}`}
          />
          <span className={`block h-0.5 w-6 bg-brown-900 transition-opacity ${open ? "opacity-0" : ""}`} />
          <span
            className={`block h-0.5 w-6 bg-brown-900 transition-transform ${open ? "-translate-y-2 -rotate-45" : ""}`}
          />
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-brown-700/15 bg-cream px-5 pb-4 lg:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-brown-900 hover:bg-brown-900/5"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/account"
            className="mt-1 rounded-lg bg-brown-900 px-3 py-2.5 text-sm font-medium text-cream"
          >
            Area Personale
          </Link>
        </nav>
      )}
    </header>
  );
}
```

## Footer — `components/Footer.tsx`

Dark brown (brown-950) 3-column footer: brand blurb + socials, then one column per shop (specialty eyebrow, name, address, hours, phone) sourced from `lib/data.ts`.

```tsx
import Link from "next/link";
import { shops } from "@/lib/data";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-brown-700/15 bg-brown-950 text-cream/90">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-3">
        <div>
          <div className="font-display text-2xl font-semibold text-cream">Taccalite</div>
          <p className="mt-2 max-w-xs text-sm text-cream/60">
            Norcineria di famiglia ad Ancona dal 1946. Formaggi, salumi, carni e la nostra
            porchetta, scelti e lavorati con cura ogni giorno.
          </p>
          <div className="mt-5 flex gap-4 text-sm">
            <a
              href="https://www.instagram.com/norcineriataccalite.centro"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:text-cream"
            >
              Instagram
            </a>
            <a
              href="https://www.facebook.com/p/Norcineria-Taccalite-100054657690138/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:text-cream"
            >
              Facebook
            </a>
          </div>
        </div>

        {shops.map((shop) => (
          <div key={shop.slug}>
            <div className="text-xs font-semibold tracking-wide text-gold uppercase">
              {shop.specialty}
            </div>
            <Link
              href={`/negozi/${shop.slug}`}
              className="mt-1 block font-display text-lg font-semibold text-cream hover:text-gold"
            >
              {shop.name}
            </Link>
            <p className="mt-2 text-sm text-cream/60">{shop.address}</p>
            <ul className="mt-2 space-y-0.5 text-sm text-cream/60">
              {shop.hours.map((h) => (
                <li key={h.label}>
                  <span className="text-cream/40">{h.label}:</span> {h.value}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-cream/60">{shop.phone}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-cream/10 px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-xs text-cream/40 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Norcineria Taccalite. Tutti i diritti riservati.</p>
          <p>Ancona, Marche</p>
        </div>
      </div>
    </footer>
  );
}
```

## PageTransition — `components/PageTransition.tsx`

Wraps every page's content in a route-keyed fade/slide.

```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

## IntroLoader — `components/IntroLoader.tsx` (global, first visit of each load)

Full-screen brown-950 overlay: gold SVG circles draw in, "Taccalite" wordmark, tagline, gold progress line, "Salta →" skip; exits with an upward clip-path wipe after 2.6s. Skipped entirely under reduced motion. (Full source in components.md.)

## SmoothScroll — `components/SmoothScroll.tsx` (global)

Lenis smooth scrolling: duration 1.3, exponential ease, `wheelMultiplier 0.9`; disabled for `prefers-reduced-motion`. Renders null.

## MagneticCursor — `components/MagneticCursor.tsx` (global, fine pointers only)

Custom gold ring cursor (`mix-blend-difference`, 16px → 56px over links/buttons, spring-following) plus a magnetic pull effect on any element with `data-magnetic` (translate 25% of cursor offset). Renders null on touch/reduced motion. (Full source in components.md.)
