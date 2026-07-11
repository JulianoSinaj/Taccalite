import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { shops } from "@/lib/data";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/5 bg-brown-950 py-24 text-cream/40 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-10">
        <div className="mb-24 grid grid-cols-1 gap-16 md:grid-cols-2 lg:grid-cols-4 lg:gap-20">
          <div className="space-y-8">
            <div className="flex flex-col">
              <span className="font-display text-4xl font-bold tracking-tighter text-white uppercase">
                Taccalite
              </span>
              <span className="mt-2 text-[11px] font-bold tracking-[0.4em] text-gold uppercase">
                Eccellenza dal 1946
              </span>
            </div>
            <p className="text-sm leading-relaxed font-light">
              Norcineria artigianale nel cuore di Ancona. Tre generazioni dedicate alla selezione e
              lavorazione delle eccellenze del territorio marchigiano.
            </p>
          </div>

          <div>
            <h5 className="mb-8 text-[10px] font-bold tracking-widest text-white uppercase">
              Navigazione
            </h5>
            <ul className="space-y-5 text-sm font-medium">
              <li>
                <Link href="/" className="transition-colors hover:text-gold">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/negozi" className="transition-colors hover:text-gold">
                  I Nostri Negozi
                </Link>
              </li>
              <li>
                <Link href="/porchetta" className="transition-colors hover:text-gold">
                  La Porchetta
                </Link>
              </li>
              <li>
                <Link href="/blog" className="transition-colors hover:text-gold">
                  News
                </Link>
              </li>
              <li>
                <Link href="/prenotazioni" className="transition-colors hover:text-gold">
                  Prenota un Tavolo
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="mb-8 text-[10px] font-bold tracking-widest text-white uppercase">
              Dove trovarci
            </h5>
            <ul className="space-y-6 text-sm font-light">
              {shops.map((shop) => (
                <li key={shop.slug}>
                  <Link href={`/negozi/${shop.slug}`} className="transition-colors hover:text-gold">
                    {shop.address}
                    <br />
                    <span className="text-[10px] tracking-widest text-white/25 uppercase">
                      {shop.name} · {shop.specialty}
                    </span>
                  </Link>
                  <p className="mt-1 text-white/30">{shop.phone}</p>
                </li>
              ))}
              <li>E: {shops[0].email}</li>
            </ul>
          </div>

          <div>
            <h5 className="mb-8 text-[10px] font-bold tracking-widest text-white uppercase">
              Rimani aggiornato
            </h5>
            <p className="mb-8 text-sm font-light">
              Ricevi inviti per le degustazioni stagionali e le news sulla porchetta calda del
              sabato.
            </p>
            <div className="flex border-b border-white/10 pb-4 transition-colors focus-within:border-gold">
              <input
                type="email"
                placeholder="Inserisci la tua email"
                aria-label="Email per la newsletter"
                className="w-full bg-transparent text-sm placeholder:text-white/15 focus:outline-none"
              />
              <button
                type="button"
                aria-label="Iscriviti alla newsletter"
                className="text-gold transition-transform hover:translate-x-1"
              >
                <ArrowRight className="size-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-10">
          <div className="flex flex-col justify-between gap-6 text-[10px] font-bold tracking-[0.3em] uppercase md:flex-row md:items-center">
            <p>© 1946–{new Date().getFullYear()} Norcineria Taccalite. Tutti i diritti riservati.</p>
            <p className="text-white/20">Ancona, Marche</p>
          </div>
          <div className="mt-10 flex justify-center gap-5">
            <a
              href="https://www.instagram.com/norcineriataccalite.centro"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 transition-all hover:bg-gold hover:text-brown-950"
            >
              <InstagramIcon className="size-5" />
            </a>
            <a
              href="https://www.facebook.com/p/Norcineria-Taccalite-100054657690138/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 transition-all hover:bg-gold hover:text-brown-950"
            >
              <FacebookIcon className="size-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
