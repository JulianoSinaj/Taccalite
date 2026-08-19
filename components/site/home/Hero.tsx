import Image from "next/image";
import CTA from "@/components/site/CTA";
import RevealLines from "@/components/site/RevealLines";
import SealMark from "@/components/site/SealMark";
import ParallaxMedia from "@/components/site/ParallaxMedia";

type HeroProps = {
  /** Rendered as the live "aperto adesso" pill. Null when hours can't be read. */
  openNow: boolean | null;
};

const facts = ["Dal 1946", "Due botteghe ad Ancona", "Ritiro in giornata"];

export default function Hero({ openNow }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-5 pt-32 pb-16 sm:px-8 sm:pt-40 sm:pb-24 lg:px-12">
      <div className="mx-auto grid max-w-[88rem] items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Norcineria · Ancona
          </p>

          <h1 className="font-display display-xl mt-8 font-semibold text-brown-950">
            <RevealLines
              immediate
              delay={0.05}
              lines={[
                "Il banco",
                "di famiglia,",
                <span key="3" className="wonk text-gold-deep">
                  dal 1946.
                </span>,
              ]}
            />
          </h1>

          <p className="mt-9 max-w-xl text-lg leading-relaxed text-brown-700">
            Formaggi scelti uno a uno, salumi lavorati come si faceva allora e la porchetta
            che il sabato esce calda dal forno. Ordina online e ritira in giornata, oppure
            passa al banco e fatti consigliare.
          </p>

          <div className="mt-11 flex flex-wrap items-center gap-3">
            <CTA href="/negozio">Ordina online</CTA>
            <CTA href="/sedi" tone="outline">
              Vieni in bottega
            </CTA>
          </div>

          <ul className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-rule pt-7 text-[0.8125rem] text-taupe">
            {facts.map((fact) => (
              <li key={fact} className="flex items-center gap-2.5">
                <span aria-hidden className="size-[3px] rounded-full bg-gold" />
                {fact}
              </li>
            ))}
            {openNow !== null && (
              <li>
                <span
                  className={
                    openNow
                      ? "inline-flex items-center gap-2 rounded-full bg-ok-soft px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-ok-soft-fg uppercase"
                      : "inline-flex items-center gap-2 rounded-full bg-paper-warm px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-taupe uppercase"
                  }
                >
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${openNow ? "bg-ok" : "bg-tan"}`}
                  />
                  {openNow ? "Aperto adesso" : "Chiuso adesso"}
                </span>
              </li>
            )}
          </ul>
        </div>

        <div className="relative lg:col-span-5">
          {/* A print mount: the photo sits on the paper, a gold hairline offset
              behind it the way a mat board sits behind a mounted print. */}
          <div className="relative mx-auto max-w-md lg:max-w-none">
            <span
              aria-hidden
              className="absolute -top-3 -right-3 bottom-3 left-3 border border-gold/45"
            />
            <ParallaxMedia className="aspect-4/5 bg-paper-warm" distance={56}>
              <Image
                src="/images/coppa-finocchio-bottega.jpg"
                alt="Coppa al finocchietto affettata sul tagliere, in bottega"
                fill
                preload
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover"
              />
            </ParallaxMedia>

            <SealMark className="pointer-events-none absolute -top-10 -left-10 size-32 sm:-top-14 sm:-left-14 sm:size-44" />
          </div>
        </div>
      </div>
    </section>
  );
}
