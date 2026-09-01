import type { Metadata } from "next";
import Image from "next/image";
import CTA from "@/components/site/CTA";
import Reveal from "@/components/Reveal";
import ParallaxMedia from "@/components/site/ParallaxMedia";
import RevealLines from "@/components/site/RevealLines";
import { getShops } from "@/lib/db/queries";
import { siteRecords } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "La nostra storia",
  description:
    "Norcineria Taccalite: dal 1946 ad Ancona, tre generazioni dietro lo stesso banco. Come scegliamo, come lavoriamo e perché le botteghe sono due.",
  alternates: { canonical: "/la-nostra-storia" },
};

/**
 * The chapters and the pillars are editable in the gestionale
 * (`storia.capitoli`, `storia.pilastri`), with the text below as the default.
 *
 * They were written only from what the shop has actually told us: the founding
 * year, the family running it, the two locations and their specialities, and the
 * Saturday porchetta. No invented milestones, no invented names — a history page
 * for a real business is the last place to fill gaps with plausible fiction. The
 * chapters are eras rather than dates for exactly that reason; when the family
 * supplies the real years, they now slot in from `/admin/contenuti` instead of a
 * deploy.
 */
export default async function StoriaPage() {
  const [shops, capitoli, pilastri] = await Promise.all([
    getShops(),
    siteRecords("storia.capitoli"),
    siteRecords("storia.pilastri"),
  ]);

  return (
    <>
      <section className="px-5 pt-28 pb-16 sm:px-8 sm:pt-32 lg:px-12">
        <div className="mx-auto grid max-w-[88rem] gap-14 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              La nostra storia
            </p>
            <h1 className="font-display display-xl mt-8 font-semibold text-brown-950">
              <RevealLines
                immediate
                lines={[
                  "Ottant'anni",
                  <span key="2">
                    dietro lo <span className="wonk text-gold-deep">stesso banco.</span>
                  </span>,
                ]}
              />
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-brown-700">
              Abbiamo aperto nel 1946 e da allora facciamo la stessa cosa: scegliere bene,
              lavorare con calma e dirlo in faccia a chi compra. Questa è la parte di
              storia che vale la pena raccontare.
            </p>
          </div>

          <Reveal className="lg:col-span-5">
            <ParallaxMedia className="aspect-[4/5] bg-paper-warm" distance={64}>
              {/* Was a hotlinked Unsplash photo of an unrelated norcino, which
                  is the one thing this page cannot afford: a page that says
                  "this is our story since 1946" illustrated by a stranger's
                  shop. The salumi on their hooks are ours, and hotlinking a
                  third-party CDN from the hero also put the LCP of this page
                  behind a domain nobody here controls. */}
              <Image
                src="/images/salumi-appesi-stagionatura.jpg"
                alt="Culatte, capocolli e pancette appesi in stagionatura nella bottega Taccalite"
                fill
                preload
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover"
              />
            </ParallaxMedia>
          </Reveal>
        </div>
      </section>

      <section className="px-5 sm:px-8 lg:px-12">
        <div className="relative mx-auto max-w-[88rem]">
          <div className="relative aspect-[16/9] overflow-hidden bg-paper-warm">
            <Image
              src="/images/banco-carni-vetrina.jpg"
              alt="Il banco delle carni della norcineria Taccalite, con i cartellini scritti a mano"
              fill
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <p className="mt-4 text-[0.8125rem] text-taupe">
            Il banco, un giorno qualunque di bottega.
          </p>
        </div>
      </section>

      <section className="bg-paper px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <h2 className="font-display display-lg max-w-2xl font-semibold text-brown-950">
            Come ci siamo <span className="wonk text-gold-deep">arrivati</span>
          </h2>

          <ol className="mt-16 border-t border-rule">
            {capitoli.map((capitolo, i) => (
              <Reveal key={capitolo.marker} delay={i * 0.05}>
                <li className="grid gap-x-10 gap-y-4 border-b border-rule py-11 md:grid-cols-[10rem_1fr] lg:grid-cols-[14rem_1fr]">
                  <p className="font-display text-[1.375rem] leading-none font-semibold tracking-[-0.02em] text-gold-deep">
                    {capitolo.marker}
                  </p>
                  <div className="max-w-2xl">
                    <h3 className="font-display text-[1.5rem] leading-snug font-semibold tracking-[-0.02em] text-brown-950 md:text-[1.75rem]">
                      {capitolo.title}
                    </h3>
                    <p className="mt-4 text-lg leading-relaxed text-brown-700">
                      {capitolo.body}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Il mestiere
          </p>
          <h2 className="font-display display-lg mt-7 max-w-2xl font-semibold text-brown-950">
            Tre cose su cui <span className="wonk text-gold-deep">non transigiamo</span>
          </h2>

          <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {pilastri.map((pilastro, i) => (
              <Reveal key={pilastro.title} delay={i * 0.07}>
                <div className="border-t border-gold/45 pt-7">
                  <h3 className="font-display text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-brown-950">
                    {pilastro.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-brown-700">
                    {pilastro.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-brown-950 px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.07]" />
        <div
          aria-hidden
          className="parallax-orb absolute -bottom-64 -left-52 h-[44rem] w-[44rem] opacity-[0.13]"
        />
        <div className="relative mx-auto max-w-[88rem]">
          <blockquote className="max-w-3xl">
            <p className="font-display display-lg font-semibold text-cream">
              «Se non lo porteremmo a casa nostra,{" "}
              <span className="wonk text-gold">non lo mettiamo al banco.»</span>
            </p>
          </blockquote>

          <div className="mt-14 grid gap-10 border-t border-cream/12 pt-10 md:grid-cols-2">
            {shops.map((shop) => (
              <div key={shop.slug}>
                <h3 className="font-display text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-cream">
                  {shop.name}
                </h3>
                <p className="mt-2 text-[0.625rem] font-semibold tracking-[0.22em] text-gold uppercase">
                  {shop.specialty}
                </p>
                <p className="mt-4 max-w-md text-[0.9375rem] leading-relaxed text-cream/65">
                  {shop.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-14 flex flex-wrap items-center gap-3">
            <CTA href="/sedi" tone="gold">
              Vieni a trovarci
            </CTA>
            <CTA href="/negozio" tone="onDark">
              Ordina online
            </CTA>
          </div>
        </div>
      </section>
    </>
  );
}
