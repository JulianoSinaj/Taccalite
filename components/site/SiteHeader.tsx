"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck, Flame, MapPin, Phone, ShoppingBag, User } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/store/cart";
import { useScrollLock } from "@/lib/use-scroll-lock";
import Magnetic from "./Magnetic";
import AccountBadge from "./AccountBadge";

/** Only what the menu needs to offer a call — the layout reads it from the DB. */
export type HeaderShop = { slug: string; name: string; phone: string | null };

const links = [
  { href: "/", label: "Home" },
  { href: "/negozio", label: "Shop" },
  { href: "/porchetta", label: "Porchetta" },
  { href: "/la-nostra-storia", label: "La nostra storia" },
  { href: "/sedi", label: "Sedi" },
  { href: "/contatti", label: "Contattaci" },
];

/**
 * The second tier of the phone menu.
 *
 * On the desktop these live in the footer, which a visitor reaches by scrolling
 * past the whole page. On a phone the menu *is* the site map — it is the only
 * full list of destinations anyone sees — so the things a norcineria is actually
 * asked for get a row each rather than being one more scroll away.
 */
const shortcuts = [
  { href: "/prenotazioni", label: "Prenota un tavolo", icon: CalendarCheck },
  { href: "/porchetta", label: "La porchetta del sabato", icon: Flame },
  { href: "/account", label: "Area personale", icon: User },
  { href: "/sedi", label: "Orari e indirizzi", icon: MapPin },
];

const EASE = [0.16, 1, 0.3, 1] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function SiteHeader({ shops = [] }: { shops?: HeaderShop[] }) {
  const callable = shops.filter((shop) => Boolean(shop.phone));
  const pathname = usePathname();
  const { count, open: openCart } = useCart();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Closed during render, not from an effect — see the same shape in
  // `AdminNav`: the effect painted the new page with the old menu still over it
  // for one frame before closing it.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The overlay covers the page, so the page behind it must not scroll under it.
  useScrollLock(menuOpen);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <header
        className={cn(
          "vt-header px-safe fixed inset-x-0 top-0 z-[80] border-b bg-paper-warm/90 backdrop-blur-xl transition-[border-color,box-shadow] duration-500",
          scrolled ? "border-rule shadow-[0_1px_24px_-12px_rgba(42,26,16,0.35)]" : "border-transparent"
        )}
      >
        <div
          className={cn(
            // The gutter and the gap both collapse on a phone. Three 44px
            // targets and the wordmark need 296px of the 320px an iPhone SE
            // gives you; at the desktop's `px-5 gap-8` they needed 400 and the
            // menu button was pushed off the right edge of the screen.
            "mx-auto flex max-w-[88rem] items-center gap-3 px-3 transition-[padding] duration-500 sm:gap-8 sm:px-8 lg:px-12",
            scrolled ? "py-2.5 sm:py-3" : "py-3.5 sm:py-5"
          )}
        >
          <Link
            href="/"
            className="group flex shrink-0 flex-col justify-center py-1.5 leading-none"
          >
            <span className="font-display text-[1.35rem] font-semibold tracking-[-0.04em] text-brown-950 uppercase transition-colors group-hover:text-gold-deep sm:text-[1.6rem]">
              Taccalite
            </span>
            {/* The tagline is the first thing to go on a 320px screen: it is
                160px of wordmark that the three 44px controls beside it need
                more than the brand does. The wordmark still says who this is. */}
            <span className="mt-1 hidden text-[0.625rem] font-semibold tracking-[0.3em] text-taupe uppercase min-[360px]:block sm:text-[0.5625rem] sm:tracking-[0.38em]">
              Norcineria dal 1946
            </span>
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-7 lg:flex xl:gap-10">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  // `.tap` rather than more padding: 11px of type on a 15px
                  // line box is a 23px target, and the gold underline below is
                  // pinned to *this* box — growing it would push the underline
                  // away from the word it belongs to. The hit area grows to
                  // 44px on an invisible pseudo-element instead, so the mark and
                  // its animation are untouched. The links sit 28px apart
                  // (`gap-7`) and overhang 3.5px a side, so no two targets meet.
                  className={cn(
                    "tap relative py-1 text-[0.6875rem] font-semibold tracking-[0.18em] whitespace-nowrap uppercase transition-colors",
                    active ? "text-brown-950" : "text-brown-700/70 hover:text-brown-950"
                  )}
                >
                  {link.label}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 -bottom-0.5 h-px origin-left bg-gold transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      active ? "scale-x-100" : "scale-x-0"
                    )}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-2 lg:ml-0 lg:gap-3">
            <Magnetic className="hidden sm:inline-flex">
              <Link
                href="/prenotazioni"
                className="group/pren relative inline-flex items-center overflow-hidden rounded-full bg-gold px-5 py-3 text-[0.6875rem] font-bold tracking-[0.16em] text-on-gold uppercase focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 bg-brown-950 [clip-path:circle(0%_at_50%_120%)] transition-[clip-path] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/pren:[clip-path:circle(150%_at_50%_120%)]"
                />
                <span className="relative z-10 transition-colors duration-500 group-hover/pren:text-cream">
                  Prenota un tavolo
                </span>
              </Link>
            </Magnetic>

            <AccountBadge />

            <button
              type="button"
              onClick={openCart}
              aria-label={count > 0 ? `Carrello, ${count} articoli` : "Carrello"}
              className="relative flex size-11 items-center justify-center rounded-full text-brown-700 transition-colors hover:bg-paper-warm hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
            >
              <ShoppingBag className="size-[1.15rem]" />
              {count > 0 && (
                <span className="absolute top-1.5 right-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-brown-950 px-1 text-[0.625rem] font-bold text-cream tabular-nums">
                  {count}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Chiudi il menu" : "Apri il menu"}
              aria-expanded={menuOpen}
              aria-controls="site-menu"
              className="flex size-11 flex-col items-center justify-center gap-[5px] rounded-full transition-colors hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none lg:hidden"
            >
              <span
                className={cn(
                  "block h-px w-5 bg-brown-950 transition-transform duration-400",
                  menuOpen && "translate-y-[3px] rotate-45"
                )}
              />
              <span
                className={cn(
                  "block h-px w-5 bg-brown-950 transition-transform duration-400",
                  menuOpen && "-translate-y-[3px] -rotate-45"
                )}
              />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="site-menu"
            /* `justify-center` is gone on purpose. Centring worked while the
               menu was five links; with the shortcut list and the phone numbers
               under it the tree is taller than a small phone, and a centred
               flex column pushes its own overflow out of *both* ends where no
               scroll can reach it. Top-aligned and scrollable holds at 568px. */
            className="px-safe fixed inset-0 z-[75] flex flex-col overflow-y-auto overscroll-contain bg-paper pt-20 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pt-24 lg:hidden"
            initial={reduceMotion ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            animate={reduceMotion ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)" }}
            exit={reduceMotion ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <nav className="flex flex-col px-5 sm:px-8" aria-label="Menu principale">
              {links.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.12 + i * 0.045 }}
                >
                  <Link
                    href={link.href}
                    aria-current={isActive(pathname, link.href) ? "page" : undefined}
                    className={cn(
                      "font-display block border-b border-rule py-3.5 text-[1.75rem] leading-tight font-semibold tracking-[-0.022em] transition-colors",
                      isActive(pathname, link.href)
                        ? "text-gold-deep"
                        : "text-brown-950 hover:text-gold-deep"
                    )}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>

            <motion.div
              className="mt-7 px-5 sm:px-8"
              initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.34 }}
            >
              <span className="eyebrow eyebrow-dark">Fai in fretta</span>
              <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden border border-rule bg-rule">
                {shortcuts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="flex items-center gap-3.5 bg-paper px-4 py-4 text-[0.9375rem] font-medium text-brown-950 transition-colors hover:bg-paper-warm"
                    >
                      <Icon className="size-[1.05rem] shrink-0 text-gold-deep" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              {/* The one thing a phone can do that a desktop cannot. A norcineria
                  is asked "is the porchetta out of the oven yet" by voice far
                  more often than by form, and the number was previously at the
                  bottom of the footer — a full page of scrolling away from the
                  menu someone opened precisely because they were looking for it. */}
              {callable.length > 0 && (
                <div className="mt-3 flex flex-col gap-2">
                  {callable.map((shop) => (
                    <a
                      key={shop.slug}
                      href={`tel:${shop.phone!.replace(/[^\d+]/g, "")}`}
                      className="flex items-center justify-center gap-2.5 rounded-full bg-brown-950 px-5 py-4 text-[0.6875rem] font-bold tracking-[0.14em] text-cream uppercase"
                    >
                      <Phone className="size-4 shrink-0 text-gold" aria-hidden />
                      {callable.length > 1 ? `Chiama ${shop.name}` : "Chiama la bottega"}
                    </a>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
