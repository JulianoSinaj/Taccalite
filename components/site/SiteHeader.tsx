"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBag, User } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/store/cart";
import Magnetic from "./Magnetic";

const links = [
  { href: "/", label: "Home" },
  { href: "/negozio", label: "Shop" },
  { href: "/la-nostra-storia", label: "La nostra storia" },
  { href: "/sedi", label: "Sedi" },
  { href: "/contatti", label: "Contattaci" },
];

const EASE = [0.16, 1, 0.3, 1] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function SiteHeader() {
  const pathname = usePathname();
  const { count, open: openCart } = useCart();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The overlay covers the page, so the page behind it must not scroll under it.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={cn(
          "vt-header fixed inset-x-0 top-0 z-[80] border-b bg-paper/85 backdrop-blur-xl transition-[border-color,box-shadow] duration-500",
          scrolled ? "border-rule shadow-[0_1px_24px_-12px_rgba(42,26,16,0.35)]" : "border-transparent"
        )}
      >
        <div
          className={cn(
            "mx-auto flex max-w-[88rem] items-center gap-8 px-5 transition-[padding] duration-500 sm:px-8 lg:px-12",
            scrolled ? "py-3" : "py-5"
          )}
        >
          <Link href="/" className="group flex shrink-0 flex-col leading-none">
            <span className="font-display text-[1.45rem] font-semibold tracking-[-0.04em] text-brown-950 uppercase transition-colors group-hover:text-gold-deep sm:text-[1.6rem]">
              Taccalite
            </span>
            <span className="mt-1 text-[0.5rem] font-semibold tracking-[0.38em] text-taupe uppercase sm:text-[0.5625rem]">
              Norcineria dal 1946
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-9 lg:flex xl:gap-11">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative py-1 text-[0.6875rem] font-semibold tracking-[0.18em] uppercase transition-colors",
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

          <div className="ml-auto flex items-center gap-2 sm:gap-3 lg:ml-0">
            <Magnetic className="hidden sm:inline-flex">
              <Link
                href="/prenotazioni"
                className="group/pren relative inline-flex items-center overflow-hidden rounded-full bg-gold px-5 py-2.5 text-[0.6875rem] font-bold tracking-[0.16em] text-on-gold uppercase focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 bg-brown-950 [clip-path:circle(0%_at_50%_120%)] transition-[clip-path] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/pren:[clip-path:circle(150%_at_50%_120%)]"
                />
                <span className="relative z-10 transition-colors duration-500 group-hover/pren:text-cream">
                  Prenota
                </span>
              </Link>
            </Magnetic>

            <Link
              href="/account"
              aria-label="Area personale"
              className="flex size-10 items-center justify-center rounded-full text-brown-700 transition-colors hover:bg-paper-warm hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
            >
              <User className="size-[1.15rem]" />
            </Link>

            <button
              type="button"
              onClick={openCart}
              aria-label={count > 0 ? `Carrello, ${count} articoli` : "Carrello"}
              className="relative flex size-10 items-center justify-center rounded-full text-brown-700 transition-colors hover:bg-paper-warm hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
            >
              <ShoppingBag className="size-[1.15rem]" />
              {count > 0 && (
                <span className="absolute top-1 right-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-brown-950 px-1 text-[0.625rem] font-bold text-cream tabular-nums">
                  {count}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Chiudi il menu" : "Apri il menu"}
              aria-expanded={menuOpen}
              className="flex size-10 flex-col items-center justify-center gap-[5px] rounded-full transition-colors hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none lg:hidden"
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
            className="fixed inset-0 z-[75] flex flex-col justify-center bg-paper px-6 pt-24 pb-10 lg:hidden"
            initial={reduceMotion ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            animate={reduceMotion ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)" }}
            exit={reduceMotion ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <nav className="flex flex-col gap-1">
              {links.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.15 + i * 0.05 }}
                >
                  <Link
                    href={link.href}
                    className={cn(
                      "font-display display-md block border-b border-rule py-4 transition-colors",
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
            <div className="mt-10 flex flex-col gap-3">
              <Link
                href="/prenotazioni"
                className="rounded-full bg-gold px-6 py-4 text-center text-[0.6875rem] font-bold tracking-[0.16em] text-on-gold uppercase"
              >
                Prenota un tavolo
              </Link>
              <Link
                href="/porchetta"
                className="rounded-full border border-rule-strong px-6 py-4 text-center text-[0.6875rem] font-bold tracking-[0.16em] text-brown-950 uppercase"
              >
                La porchetta del sabato
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
