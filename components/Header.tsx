"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { User } from "lucide-react";

const links = [
  { href: "/", label: "Home" },
  { href: "/negozi", label: "Le Botteghe" },
  { href: "/porchetta", label: "La Porchetta" },
  { href: "/negozio", label: "E-Shop" },
  { href: "/blog", label: "News" },
  { href: "/prenotazioni", label: "Prenota" },
];

export default function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 100);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 z-[60] w-full border-b border-brown-900/5 bg-cream/95 backdrop-blur-xl transition-all duration-500 ${
        scrolled ? "shadow-lg shadow-brown-950/5" : ""
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center justify-between px-5 transition-all duration-500 sm:px-10 ${
          scrolled ? "py-3" : "py-5"
        }`}
      >
        <Link href="/" className="group flex flex-col">
          <span className="font-display text-2xl font-bold tracking-tighter text-brown-950 uppercase transition-colors group-hover:text-gold-deep sm:text-3xl">
            Taccalite
          </span>
          <span className="mt-1 text-[10px] font-bold tracking-[0.45em] text-brown-700 uppercase">
            Norcineria dal 1946
          </span>
        </Link>

        <nav className="hidden items-center gap-10 text-[11px] font-bold tracking-[0.2em] uppercase lg:flex xl:gap-12">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-colors hover:text-gold-deep ${
                  active ? "border-b-2 border-gold pb-1 text-brown-950" : "text-brown-900/75"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/account"
            data-magnetic
            className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-[10px] font-bold tracking-widest text-brown-950 uppercase shadow-[0_10px_20px_-5px_rgba(225,190,100,0.3)] transition-all duration-500 hover:-translate-y-0.5 hover:bg-gold-dark hover:shadow-[0_20px_30px_-10px_rgba(225,190,100,0.4)]"
          >
            <User className="size-3.5" />
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
              className="rounded-lg px-3 py-2.5 text-xs font-bold tracking-[0.2em] text-brown-900 uppercase hover:bg-brown-900/5"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/account"
            className="mt-1 rounded-full bg-gold px-4 py-3 text-center text-xs font-bold tracking-widest text-brown-950 uppercase"
          >
            Area Personale
          </Link>
        </nav>
      )}
    </header>
  );
}
