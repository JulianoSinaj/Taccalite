import type { Metadata } from "next";
import Image from "next/image";
import CTA from "@/components/site/CTA";
import Reveal from "@/components/Reveal";
import ParallaxMedia from "@/components/site/ParallaxMedia";
import RevealLines from "@/components/site/RevealLines";
import { CornerTicks, GhostNumeral } from "@/components/site/sedi/Ornaments";
import { getShops } from "@/lib/db/queries";
import { siteRecords } from "@/lib/site-content";

export const dynamic = "force-dynamic";

function ordinal(i: number) {
  return String(i + 1).padStart(2, "0");
}

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
              {/* This started as a hotlinked Unsplash photo of an unrelated
                  norcino — the one thing this page cannot afford: "our story
                  since 1946" illustrated by a stranger's shop, with the LCP
                  behind a CDN nobody here controls. It then became our own
                  salumi on their hooks, which was honest but anonymous.

                  It is now Paolo, at the banco the headline is about. A page
                  that promises eighty years behind the same counter should
                  open on the person standing behind it; the salumi still hang
                  in the frame, but they are the setting, not the subject.
                  Cut from the shop's own video — the only footage of him we
                  have — so it is softer than a studio portrait. That is the
                  right trade until someone photographs him properly. */}
              <Image
                src="/images/paolo-taccalite-ritratto.jpg"
                alt="Paolo Taccalite affetta un pezzo di coppa al banco, tra i prosciutti e le forme di formaggio della bottega"
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
        <div className="relative mx-auto max-w-[88rem] p-3 sm:p-4">
          {/* The crop marks sit on the paper *outside* the image, where a
              printer's trim marks belong — and where they stay legible whatever
              the photograph happens to be doing at its corners. */}
          <CornerTicks />
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

      {/* The warm step, not the white one: the hero and the photograph above are
          both on plain paper, so a third white band ran the top half of the page
          together into one flat field. The chapters are also the oldest thing on
          the page, and the warm stock reads as the older paper. */}
      <section className="bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <h2 className="font-display display-lg max-w-2xl font-semibold text-brown-950">
            Come ci siamo <span className="wonk text-gold-deep">arrivati</span>
          </h2>

          <ol className="relative mt-16 border-t border-rule">
            {/* The spine. One line for the whole list rather than a border per
                row, because a row's border stops at its padding and a
                chronology drawn in dashes reads as four unrelated entries.
                The offsets are the grid's own column widths below — the text
                column starts where the rule is struck. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-[10rem] hidden w-px bg-rule md:block lg:left-[14rem]"
            />

            {capitoli.map((capitolo, i) => (
              <li key={capitolo.marker} className="border-b border-rule">
                <Reveal
                  delay={i * 0.05}
                  className="grid gap-y-4 py-11 md:grid-cols-[10rem_1fr] lg:grid-cols-[14rem_1fr]"
                >
                  <GhostNumeral
                    n={ordinal(i)}
                    className="text-[2.75rem] text-brown-950/15 tabular-nums sm:text-[3.25rem]"
                  />
                  <div className="relative md:pl-10">
                    {/* The node on the spine: a struck diamond, filled with the
                        page so the rule passes behind it rather than through. */}
                    <span
                      aria-hidden
                      className="absolute top-2.5 -left-1 hidden size-2 rotate-45 border border-gold bg-paper-warm md:block"
                    />
                    {/* Title, dotted leader, era — the line of a contents page.
                        The measure of the body below is ~65 characters, so
                        without it every row left the right half of the band
                        empty; the leader is what makes that space read as
                        deliberate rather than unfinished. */}
                    <div className="flex flex-col gap-1.5 md:flex-row md:items-baseline md:gap-5">
                      <h3 className="font-display text-[1.5rem] leading-snug font-semibold tracking-[-0.02em] text-brown-950 md:text-[1.75rem]">
                        {capitolo.title}
                      </h3>
                      <span
                        aria-hidden
                        className="mb-2 hidden min-w-8 flex-1 border-b border-dotted border-rule-strong md:block"
                      />
                      <p className="font-display shrink-0 text-[1.125rem] leading-none font-semibold tracking-[-0.02em] text-gold-deep md:text-[1.375rem]">
                        {capitolo.marker}
                      </p>
                    </div>
                    <p className="mt-4 max-w-2xl text-lg leading-relaxed text-brown-700">
                      {capitolo.body}
                    </p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div className="mx-auto grid max-w-[88rem] gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              Il mestiere
            </p>
            <h2 className="font-display display-lg mt-7 max-w-2xl font-semibold text-brown-950">
              Tre cose su cui <span className="wonk text-gold-deep">non transigiamo</span>
            </h2>

            <div className="mt-12 grid gap-4 sm:gap-5">
              {pilastri.map((pilastro, i) => (
                <Reveal key={pilastro.title} delay={i * 0.07}>
                  {/* Printed plates rather than three columns of text under a
                      gold rule: stacked beside the photograph they give the
                      band a left edge, and the crop marks tie them to the
                      framed insert opposite. */}
                  <div className="relative flex gap-5 bg-paper-warm p-6 sm:gap-7 sm:p-7">
                    <CornerTicks tone="gold" size="sm" />
                    <GhostNumeral
                      n={ordinal(i)}
                      className="text-[2.5rem] text-brown-950/15 tabular-nums"
                    />
                    <div>
                      <h3 className="font-display text-[1.5rem] leading-none font-semibold tracking-[-0.025em] text-brown-950">
                        {pilastro.title}
                      </h3>
                      <p className="mt-3 text-base leading-relaxed text-brown-700">
                        {pilastro.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          {/* The one photograph in the lower half of the page. Everything from
              the chapters down was type on paper, which is what made the second
              half read as dry — and this band is where a picture is honest:
              it is the bottega now, not a stand-in for a decade nobody
              photographed. */}
          <Reveal className="lg:col-span-5" delay={0.1}>
            <div className="relative p-3 sm:p-4">
              <CornerTicks />
              <ParallaxMedia className="aspect-[4/5] bg-paper-warm" distance={56}>
                <Image
                  src="/images/salumi-appesi-bottega.jpg"
                  alt="Salumi appesi al bancone della bottega — salsicce e ciauscolo con l'etichetta Taccalite, e le forme di formaggio sugli scaffali dietro"
                  fill
                  sizes="(max-width: 1024px) 90vw, 40vw"
                  className="object-cover"
                />
              </ParallaxMedia>
            </div>
            <p className="mt-3 px-3 text-[0.8125rem] text-taupe sm:px-4">
              Le nostre etichette, appese dove le trovate.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="relative overflow-hidden bg-brown-950 px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.07]" />
        {/* The same oven mouth the other dark bands are lit by. Without it this
            one was the only flat brown left on the storefront. */}
        <div aria-hidden className="ember absolute inset-0 opacity-70" />
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
