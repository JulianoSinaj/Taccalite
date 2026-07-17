import Link from "next/link";
import { getShops } from "@/lib/db/queries";
import { siteConfig } from "@/lib/site";
import NewsletterForm from "@/components/NewsletterForm";

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

export default async function Footer() {
  const shops = await getShops();
  return (
    <footer className="relative z-10 overflow-hidden border-t border-white/5 bg-brown-950 pb-24 text-cream/70 sm:pb-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 select-none"
      >
        <p className="font-display translate-y-[38%] text-center text-[13vw] leading-none font-bold tracking-tighter text-white/[0.03] uppercase">
          Taccalite
        </p>
      </div>
      <div className="relative mx-auto max-w-7xl px-5 pt-16 sm:px-10 sm:pt-20">
        <div className="mb-6 grid grid-cols-1 gap-16 md:mb-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-20">
          <div className="space-y-8">
            <div className="flex flex-col">
              <span className="font-display text-4xl font-bold tracking-tighter text-white uppercase">
                Taccalite
              </span>
              <span className="mt-2 text-[11px] font-bold tracking-[0.4em] text-gold uppercase">
                Eccellenza dal 1946
              </span>
            </div>
            <p className="text-sm leading-relaxed font-light text-cream/75">
              Norcineria artigianale nel cuore di Ancona. Dal 1946, tre generazioni scelgono e
              lavorano ogni giorno le eccellenze del territorio marchigiano.
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
                  Le Botteghe
                </Link>
              </li>
              <li>
                <Link href="/porchetta" className="transition-colors hover:text-gold">
                  La Porchetta
                </Link>
              </li>
              <li>
                <Link href="/negozio" className="transition-colors hover:text-gold">
                  E-Shop
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
                    <span className="text-[10px] tracking-widest text-white/55 uppercase">
                      {shop.name} · {shop.specialty}
                    </span>
                  </Link>
                  <p className="mt-1 text-white/60">{shop.phone}</p>
                </li>
              ))}
              <li>E: {siteConfig.email}</li>
            </ul>
          </div>

          <div>
            <h5 className="mb-8 text-[10px] font-bold tracking-widest text-white uppercase">
              Rimani aggiornato
            </h5>
            <p className="mb-8 text-sm font-light text-cream/75">
              Ricevi gli inviti alle degustazioni stagionali e l&apos;avviso quando la porchetta
              del sabato esce dal forno.
            </p>
            <NewsletterForm />
          </div>
        </div>

        <div className="border-t border-white/5 pt-6 md:pt-10">
          <div className="flex flex-col justify-between gap-6 text-[10px] font-bold tracking-[0.3em] uppercase md:flex-row md:items-center">
            <p>© 1946–{new Date().getFullYear()} Norcineria Taccalite. Tutti i diritti riservati.</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/privacy" className="text-white/60 transition-colors hover:text-gold">
                Privacy
              </Link>
              <Link href="/cookie" className="text-white/60 transition-colors hover:text-gold">
                Cookie
              </Link>
              <span className="text-white/50">Ancona, Marche</span>
            </div>
          </div>
          <div className="mt-10 flex justify-center gap-5">
            <a
              href="https://www.instagram.com/norcineriataccalite.centro"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-cream/80 transition-all hover:bg-gold hover:text-brown-950"
            >
              <InstagramIcon className="size-5" />
            </a>
            <a
              href="https://www.facebook.com/p/Norcineria-Taccalite-100054657690138/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-cream/80 transition-all hover:bg-gold hover:text-brown-950"
            >
              <FacebookIcon className="size-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
