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
