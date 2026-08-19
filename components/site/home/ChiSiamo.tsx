import Image from "next/image";
import CTA from "@/components/site/CTA";
import Reveal from "@/components/Reveal";
import ParallaxMedia from "@/components/site/ParallaxMedia";

export default function ChiSiamo() {
  return (
    <section className="relative overflow-hidden bg-paper-warm px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
      {/* The founding year as a ghost numeral, cropped by the left edge. It is
          the oldest thing the shop owns, so it gets to be the biggest. */}
      <span
        aria-hidden
        className="font-display pointer-events-none absolute -left-6 bottom-0 text-[26vw] leading-[0.72] font-semibold tracking-[-0.06em] text-transparent select-none sm:-left-10"
        style={{ WebkitTextStroke: "1px rgba(42,26,16,0.09)" }}
      >
        1946
      </span>

      <div className="relative mx-auto grid max-w-[88rem] gap-14 lg:grid-cols-12 lg:items-center lg:gap-16">
        <Reveal className="lg:col-span-5">
          <div className="relative">
            <span aria-hidden className="absolute -top-3 -left-3 right-3 bottom-3 border border-gold/45" />
            <ParallaxMedia className="aspect-[5/6] bg-paper" distance={64}>
              {/* The counter itself, not another studio still life. It is the
                  only photograph on file with the shop's real colour in it —
                  the trays, the price cards, the crowd of things — and it was
                  going unused while the same prosciutto-by-the-fire shot ran
                  three times on this page. */}
              <Image
                src="/images/home-hero-gastronomia.jpg"
                alt="Il banco della gastronomia: teglie, olive all'ascolana e prosciutto al taglio"
                fill
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover"
              />
            </ParallaxMedia>
          </div>
        </Reveal>

        <div className="lg:col-span-6 lg:col-start-7">
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Chi siamo
          </p>

          <h2 className="font-display display-lg mt-7 font-semibold text-brown-950">
            Tre generazioni <span className="wonk text-gold-deep">dietro lo stesso banco</span>
          </h2>

          <div className="mt-8 space-y-5 text-lg leading-relaxed text-brown-700">
            <p>
              Abbiamo aperto nel 1946, quando ad Ancona la norcineria era un mestiere che si
              imparava guardando. Da allora è cambiato quasi tutto tranne il modo in cui
              scegliamo: un produttore alla volta, una forma alla volta, assaggiando prima noi.
            </p>
            <p>
              Oggi le botteghe sono due — i grandi formaggi in Piazza Kennedy, le carni e i
              salumi al Mercato Coperto del Piano — e dietro il banco c&apos;è ancora la stessa
              famiglia.
            </p>
          </div>

          <blockquote className="mt-10 border-l border-gold pl-6">
            <p className="font-display text-2xl leading-snug font-semibold text-brown-950 sm:text-[1.75rem]">
              «Se non lo porteremmo a casa nostra, non lo mettiamo al banco.»
            </p>
          </blockquote>

          <div className="mt-10">
            <CTA href="/la-nostra-storia" tone="outline">
              La nostra storia
            </CTA>
          </div>
        </div>
      </div>
    </section>
  );
}
