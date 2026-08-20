import type { Metadata } from "next";
import { Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import ContactForm from "@/components/site/ContactForm";
import Reveal from "@/components/Reveal";
import { getShops } from "@/lib/db/queries";
import { shopIsOpenNow, shopHoursRows } from "@/lib/hours";
import { siteConfig } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contattaci",
  description:
    "Scrivici o passa in bottega: indirizzi, orari e telefono dei due negozi Taccalite ad Ancona. Catering, consegne a domicilio e richieste speciali.",
  alternates: { canonical: "/contatti" },
};

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, Ancona`)}`;
}

export default async function ContattiPage() {
  const shops = await getShops();

  return (
    <>
      <section className="px-5 pt-32 pb-14 sm:px-8 sm:pt-40 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Contattaci
          </p>
          <h1 className="font-display display-xl mt-8 max-w-3xl font-semibold text-brown-950">
            Parliamone <span className="wonk text-gold-deep">di persona.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-brown-700">
            Per un tagliere, un buffet, una consegna o una forma che non trovate da
            nessun&apos;altra parte: scriveteci, o passate al banco e ne parliamo.
          </p>
        </div>
      </section>

      <section className="px-5 pb-24 sm:px-8 sm:pb-32 lg:px-12">
        <div className="mx-auto grid max-w-[88rem] gap-16 border-t border-rule pt-14 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <h2 className="font-display display-md font-semibold text-brown-950">
              Scriveteci
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-brown-700">
              Più dettagli ci date, più precisa sarà la risposta: quante persone, per
              quando, e se ci sono allergie o intolleranze da tenere presenti.
            </p>
            <div className="mt-10">
              <ContactForm />
            </div>
          </div>

          <div className="lg:col-span-5">
            <h2 className="font-display display-md font-semibold text-brown-950">
              Le due botteghe
            </h2>

            <div className="mt-10 flex flex-col gap-12">
              {shops.map((shop) => {
                const open = shopIsOpenNow(shop);
                const rows = shopHoursRows(shop);
                return (
                  <Reveal key={shop.slug}>
                    <article className="border-t border-rule pt-7">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="font-display text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-brown-950">
                          {shop.name}
                        </h3>
                        {open && (
                          <span
                            className={
                              open.open
                                ? "inline-flex items-center gap-2 rounded-full bg-ok-soft px-3 py-1 text-[0.625rem] font-semibold tracking-[0.14em] text-ok-soft-fg uppercase"
                                : "inline-flex items-center gap-2 rounded-full bg-paper-warm px-3 py-1 text-[0.625rem] font-semibold tracking-[0.14em] text-taupe uppercase"
                            }
                          >
                            <span
                              aria-hidden
                              className={`size-1.5 rounded-full ${open.open ? "bg-ok" : "bg-tan"}`}
                            />
                            {open.open ? "Aperto adesso" : "Chiuso adesso"}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-[0.625rem] font-semibold tracking-[0.22em] text-gold-deep uppercase">
                        {shop.specialty}
                      </p>

                      <ul className="mt-6 space-y-5 text-[0.9375rem] text-brown-700 sm:space-y-3.5">
                        <li className="flex items-start gap-3">
                          <MapPin className="mt-1 size-4 shrink-0 text-gold-deep" aria-hidden />
                          <a
                            href={mapsHref(shop.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tap group inline-flex items-center gap-1.5 transition-colors hover:text-brown-950"
                          >
                            {shop.address}
                            <ExternalLink
                              className="size-3.5 text-tan transition-colors group-hover:text-gold-deep"
                              aria-hidden
                            />
                          </a>
                        </li>
                        {shop.phone && (
                          <li className="flex items-start gap-3">
                            <Phone className="mt-1 size-4 shrink-0 text-gold-deep" aria-hidden />
                            <a
                              href={telHref(shop.phone)}
                              className="tap font-medium text-brown-950 transition-colors hover:text-gold-deep"
                            >
                              {shop.phone}
                            </a>
                          </li>
                        )}
                        {rows.length > 0 && (
                          <li className="flex items-start gap-3">
                            <Clock className="mt-1 size-4 shrink-0 text-gold-deep" aria-hidden />
                            <span className="flex flex-col gap-1">
                              {rows.map((row) => (
                                <span key={row.label}>
                                  <span className="text-brown-950">{row.label}</span> — {row.value}
                                </span>
                              ))}
                              {!shop.hoursConfirmed && (
                                <span className="text-[0.8125rem] text-taupe">
                                  Orari in aggiornamento: conviene chiamare prima di passare.
                                </span>
                              )}
                            </span>
                          </li>
                        )}
                      </ul>
                    </article>
                  </Reveal>
                );
              })}

              <div className="border-t border-rule pt-7">
                <h3 className="text-[0.625rem] font-semibold tracking-[0.22em] text-taupe uppercase">
                  Altrimenti
                </h3>
                <ul className="mt-5 space-y-5 text-[0.9375rem] text-brown-700 sm:space-y-3.5">
                  <li className="flex items-start gap-3">
                    <Mail className="mt-1 size-4 shrink-0 text-gold-deep" aria-hidden />
                    <a
                      href={`mailto:${siteConfig.email}`}
                      className="tap break-all transition-colors hover:text-brown-950"
                    >
                      {siteConfig.email}
                    </a>
                  </li>
                  <li className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-7">
                    <a
                      href={siteConfig.social.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap transition-colors hover:text-brown-950"
                    >
                      Instagram
                    </a>
                    <a
                      href={siteConfig.social.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap transition-colors hover:text-brown-950"
                    >
                      Facebook
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
