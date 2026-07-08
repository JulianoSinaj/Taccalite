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
