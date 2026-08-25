import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { getShops, getSetting } from "@/lib/db/queries";
import { siteConfig } from "@/lib/site";
import NewsletterForm from "@/components/NewsletterForm";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/negozio", label: "Shop" },
  { href: "/porchetta", label: "Porchetta" },
  { href: "/la-nostra-storia", label: "La nostra storia" },
  { href: "/sedi", label: "Sedi" },
  { href: "/contatti", label: "Contattaci" },
];

const moreLinks = [
  { href: "/prenotazioni", label: "Prenota un tavolo" },
  { href: "/blog", label: "Dal diario" },
  { href: "/account", label: "Area personale" },
  { href: "/traccia", label: "Traccia il tuo ordine" },
];

/** `tel:` needs the digits without the spacing that makes a number readable. */
function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * The one brown block at the foot of a white page. Brief was explicit: the page
 * turns white, the footer stays the colour it is.
 */
export default async function SiteFooter() {
  const [shops, legalName, vatNumber] = await Promise.all([
    getShops(),
    getSetting<string>("business.legalName", siteConfig.legalName),
    getSetting<string>("business.vatNumber", ""),
  ]);

  return (
    <footer className="relative isolate overflow-hidden bg-brown-950 text-cream/70">
      {/* The wordmark as a watermark, cropped by the page edge. */}
      <p
        aria-hidden
        className="font-display pointer-events-none absolute inset-x-0 bottom-0 translate-y-[34%] text-center text-[15vw] leading-none font-semibold tracking-[-0.05em] text-cream/[0.035] uppercase select-none"
      >
        Taccalite
      </p>

      <div className="relative mx-auto max-w-[88rem] px-5 pt-12 pb-10 sm:px-8 sm:pt-16 lg:px-12">
        <div className="grid gap-11 sm:gap-14 md:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_1.1fr_1.1fr] lg:gap-12">
          <div className="max-w-sm">
            <span className="font-display block text-[2.25rem] leading-none font-semibold tracking-[-0.045em] text-cream uppercase">
              Taccalite
            </span>
            <span className="mt-2.5 block text-[0.625rem] sm:text-[0.5625rem] font-semibold tracking-[0.4em] text-gold uppercase">
              Norcineria · Ancona · dal 1946
            </span>
            <p className="mt-7 text-[0.9375rem] leading-relaxed text-cream/65">
              Tre generazioni dietro lo stesso banco. Scegliamo e lavoriamo ogni giorno le
              eccellenze delle Marche, come si faceva nel 1946 e come continueremo a fare.
            </p>
            <div className="mt-8 flex gap-3">
              <a
                href={siteConfig.social.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex size-11 items-center justify-center rounded-full border border-cream/15 text-cream/75 transition-colors hover:border-gold hover:bg-gold hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
              >
                <InstagramIcon className="size-[1.15rem]" />
              </a>
              <a
                href={siteConfig.social.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="flex size-11 items-center justify-center rounded-full border border-cream/15 text-cream/75 transition-colors hover:border-gold hover:bg-gold hover:text-brown-950 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
              >
                <FacebookIcon className="size-[1.15rem]" />
              </a>
            </div>
          </div>

          {/* Two columns on a phone, one above `sm`. Fourteen links stacked
              single-file made a 700px tail hanging off the end of every page,
              and each of them was a 19px-tall line of text — the most-repeated
              tap target on the site and the smallest. `py-1.5` on a 15px line
              brings each row to 44px without opening visible gaps between
              them. */}
          <nav aria-label="Navigazione principale">
            <h2 className="text-[0.625rem] font-bold tracking-[0.24em] text-cream uppercase">
              Naviga
            </h2>
            <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-1">
              <ul className="mt-5 text-[0.9375rem] sm:mt-7">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block py-2.5 transition-colors hover:text-gold"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <ul className="mt-5 text-[0.9375rem] sm:mt-7 sm:border-t sm:border-cream/10 sm:pt-6">
                {moreLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block py-2.5 transition-colors hover:text-gold"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div>
            <h2 className="text-[0.625rem] font-bold tracking-[0.24em] text-cream uppercase">
              Le due botteghe
            </h2>
            <ul className="mt-5 space-y-6 text-[0.9375rem] sm:mt-7 sm:space-y-7">
              {shops.map((shop) => (
                <li key={shop.slug}>
                  <Link
                    href={`/sedi/${shop.slug}`}
                    className="inline-block py-2.5 font-medium text-cream transition-colors hover:text-gold"
                  >
                    {shop.name}
                  </Link>
                  <span className="mt-1 block text-[0.625rem] font-semibold tracking-[0.22em] text-gold uppercase">
                    {shop.specialty}
                  </span>
                  <span className="mt-3 flex items-start gap-2.5 text-cream/65">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-cream/40" aria-hidden />
                    {shop.address}
                  </span>
                  {shop.phone && (
                    <a
                      href={telHref(shop.phone)}
                      className="mt-0.5 flex items-center gap-2.5 py-2.5 text-cream/65 transition-colors hover:text-gold"
                    >
                      <Phone className="size-3.5 shrink-0 text-cream/40" aria-hidden />
                      {shop.phone}
                    </a>
                  )}
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="flex items-center gap-2.5 py-2.5 break-all text-cream/65 transition-colors hover:text-gold"
                >
                  <Mail className="size-3.5 shrink-0 text-cream/40" aria-hidden />
                  {siteConfig.email}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-[0.625rem] font-bold tracking-[0.24em] text-cream uppercase">
              Resta aggiornato
            </h2>
            <p className="mt-5 text-[0.9375rem] leading-relaxed text-cream/65 sm:mt-7">
              Un messaggio quando la porchetta esce dal forno, quando arriva una forma nuova
              al banco e quando siamo in fiera. Niente altro.
            </p>
            <div className="mt-5 sm:mt-7">
              <NewsletterForm />
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-cream/10 pt-7 sm:mt-16 sm:pt-8">
          <div className="flex flex-col gap-5 text-[0.8125rem] text-cream/50 lg:flex-row lg:items-center lg:justify-between">
            <p>
              © {siteConfig.founded}–{new Date().getFullYear()} {legalName}
              {vatNumber && <> · P.IVA {vatNumber}</>}
            </p>
            <div className="-my-2 flex flex-wrap items-center gap-x-7 gap-y-0">
              <Link href="/privacy" className="py-2 transition-colors hover:text-gold">
                Privacy
              </Link>
              <Link href="/cookie" className="py-2 transition-colors hover:text-gold">
                Cookie
              </Link>
              <Link href="/termini" className="py-2 transition-colors hover:text-gold">
                Condizioni di vendita
              </Link>
              <span className="py-2">Ancona · Marche · Italia</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
