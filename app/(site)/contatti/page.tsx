import type { Metadata } from "next";
import Image from "next/image";
import { Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import ContactForm from "@/components/site/ContactForm";
import PageHero from "@/components/site/PageHero";
import ParallaxMedia from "@/components/site/ParallaxMedia";
import { PhotoCredit } from "@/components/site/PhotoCredit";
import Reveal from "@/components/Reveal";
import { getShops } from "@/lib/db/queries";
import { shopIsOpenNow, shopHoursRows } from "@/lib/hours";
import { siteConfig } from "@/lib/site";
import { siteText } from "@/lib/site-content";
import { emphasise } from "@/components/site/Headline";

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
  const [shops, titolo, testo, formTitolo, formTesto] = await Promise.all([
    getShops(),
    siteText("contatti.titolo"),
    siteText("contatti.testo"),
    siteText("contatti.form.titolo"),
    siteText("contatti.form.testo"),
  ]);

  return (
    <>
      {/* This page used to hand-copy the masthead markup instead of calling
          `PageHero` — the only inner page that did — and so it also never had
          the component's two photo slots. The right five columns were empty
          from the header down to the rule, which is the exact void `PageHero`
          exists to close.

          It takes `media` rather than `aside`: a framed photo here would have
          sat directly above the framed register below it and read as two cards
          stacked, where the bleed reads as ground the masthead is set on. */}
      <PageHero
        eyebrow="Contattaci"
        // The only CMS-driven `PageHero` title on the site — every other one is
        // JSX with the break authored in. `emphasise` splits on `**…**`, so the
        // shop's asterisks decide the line break as well as the gold: the
        // default "Parliamone **di persona.**" sets as two lines, and copy with
        // no marker sets as one. Both are headlines, so there is no edit that
        // breaks this — only edits that reflow it.
        title={emphasise(titolo)}
        lede={testo}
        media={
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] lg:block">
            {/* Chosen for how it survives the mask rather than for what it is
                of. The gradient below dissolves the left ~40% of this panel, so
                a photograph with one subject loses half of it; this one is an
                all-over field of trays with no focal point to cut, and reads
                the same whatever the viewport does to its left edge.

                It is also the only warm, dense photo in `public/images` that no
                other page had claimed — and it deliberately does not rhyme with
                either register photo below (a cheese board, salumi on hooks). */}
            <Image
              src="/images/gastronomia-preparati-freschi.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 48vw, 1px"
              // `priority` is deprecated in this Next; the docs point at these
              // two rather than at `preload`, which is the other idiom still in
              // the tree (`sedi/[slug]`).
              loading="eager"
              fetchPriority="high"
              className="object-cover"
              style={{
                // Masked, not washed. The page's ground is cream with
                // `--paper-grain` multiplied over it, so a paper-coloured panel
                // laid on top fades the photo out *to a flat colour* and the
                // seam it was hiding comes back as untextured cream on textured
                // cream. Removing the pixels instead leaves the real page —
                // grain and all — underneath, with nothing for an edge to form
                // between. Same ramp as `/porchetta`, for the same reason.
                maskImage:
                  "linear-gradient(to right, transparent 8%, rgba(0,0,0,0.55) 26%, #000 46%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 8%, rgba(0,0,0,0.55) 26%, #000 46%)",
              }}
            />

            {/* The header is translucent paper with grain in it, and a
                photograph read through that grain looks like a printing fault —
                so the picture starts below the chrome. Flat cream is the right
                paint here precisely because the header is flat cream too. */}
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-paper via-paper/85 to-transparent" />
          </div>
        }
      />

      <section className="px-5 pb-16 sm:px-8 sm:pb-20 lg:px-12">
        <div className="mx-auto grid max-w-[88rem] gap-16 border-t border-rule pt-14 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            <h2 className="font-display display-md font-semibold text-brown-950">
              {formTitolo}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-brown-700">{formTesto}</p>
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
                // Both shops carry a photograph in the database already —
                // `shops.image`, editable from `/admin/shops`, which even warns
                // when one is missing — and this page was rendering them as
                // text. The picture is content the shop owns, not decoration
                // picked here, so an emptied field has to degrade rather than
                // leave a hole: no photo means the plain heading below, which
                // is exactly what this register looked like before.
                const photo = shop.image;

                const pill = open && (
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
                );

                return (
                  <Reveal key={shop.slug}>
                    <article className="border-t border-rule pt-7">
                      {photo ? (
                        // The name set *on* the photograph rather than beside
                        // it. Two reasons: a picture with a caption under it is
                        // a picture added to a list, where a title over a
                        // picture is the list entry itself — and it costs only
                        // the band's height, because the heading that would
                        // have sat above moves into it instead.
                        <div className="relative">
                          {/* `4/3`, matching how `sedi/[slug]` frames this same
                              field — and not for consistency alone. One of the
                              two shop photos is portrait (576×705) and the
                              other landscape (576×432); a 16/9 band cropped the
                              portrait one down to a slice of its middle and
                              threw the composition away. This is the shallowest
                              band both orientations survive. */}
                          <ParallaxMedia className="aspect-[4/3]" distance={32}>
                            <Image
                              src={photo}
                              alt={shop.imageLabel || shop.name}
                              fill
                              className="object-cover"
                              sizes="(max-width: 1024px) 100vw, 40vw"
                            />
                          </ParallaxMedia>

                          {/* Deep enough at the foot to hold display type at
                              `text-cream`, and barely there at the head so the
                              photograph is still a photograph. */}
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brown-950/92 via-brown-950/35 to-brown-950/5"
                          />

                          {/* The credit rides above the wash: `shop.image` is
                              admin-editable, so this frame can be pointed at a
                              licensed photo — the Wikimedia porchetta is still
                              in `PhotoCredit`'s map — and the obligation has to
                              follow the file rather than the page. */}
                          <PhotoCredit src={photo} />

                          <div className="absolute inset-x-0 bottom-0 p-5">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="font-display text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-cream">
                                {shop.name}
                              </h3>
                              {pill}
                            </div>
                            <p className="mt-2 text-[0.625rem] font-semibold tracking-[0.22em] text-gold uppercase">
                              {shop.specialty}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="font-display text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-brown-950">
                              {shop.name}
                            </h3>
                            {pill}
                          </div>
                          <p className="mt-2 text-[0.625rem] font-semibold tracking-[0.22em] text-gold-deep uppercase">
                            {shop.specialty}
                          </p>
                        </>
                      )}

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
