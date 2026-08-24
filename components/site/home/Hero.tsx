import Image from "next/image";
import CTA from "@/components/site/CTA";
import RevealLines from "@/components/site/RevealLines";
import ParallaxMedia from "@/components/site/ParallaxMedia";

type HeroProps = {
  /** Rendered as the live "aperto adesso" pill. Null when hours can't be read. */
  openNow: boolean | null;
  /** Editable in the gestionale (`home.hero.facts`); the page resolves them. */
  facts: string[];
};

export default function Hero({ openNow, facts }: HeroProps) {
  return (
    <section className="relative overflow-hidden px-5 pt-28 pb-14 sm:px-8 sm:pt-32 sm:pb-16 lg:px-12">
      {/* Warmth behind the headline. The hero used to be type on flat white,
          which is why the page read as a document rather than a shopfront: the
          eye had nothing to land on between the words and the photograph. Two
          very soft washes give the corner a light source without becoming a
          gradient anyone would name. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(58% 48% at 12% 6%, rgba(225,190,100,0.16), transparent 70%), radial-gradient(46% 42% at 96% 78%, rgba(164,71,42,0.09), transparent 72%)",
        }}
      />

      {/* Spine: the shop's own furniture, set in the margin the way a masthead
          runs up the edge of a printed page. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-44 left-4 hidden items-center gap-4 text-[0.625rem] sm:text-[0.5625rem] font-semibold tracking-[0.42em] text-taupe uppercase [writing-mode:vertical-rl] xl:flex"
      >
        <span className="h-14 w-px bg-rule-strong" />
        Ancona · Marche
      </span>

      <div className="mx-auto grid max-w-[88rem] items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Norcineria · Ancona
          </p>

          <h1 className="font-display display-xl display-fit mt-6 font-semibold text-brown-950">
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

          <p className="mt-7 max-w-xl text-lg leading-relaxed text-brown-700">
            Formaggi scelti uno a uno, salumi lavorati come si faceva allora e la porchetta
            che il sabato esce calda dal forno. Ordina online e ritira in giornata, oppure
            passa al banco e fatti consigliare.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <CTA href="/negozio">Ordina online</CTA>
            <CTA href="/sedi" tone="outline">
              Vieni in bottega
            </CTA>
          </div>

          {/* The proof row, on its own ground rather than floating under a
              hairline. Three facts and a live state is a claim worth a surface. */}
          <ul className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3 border border-rule bg-paper-warm px-5 py-3.5 text-[0.8125rem] text-brown-700 sm:px-6">
            {facts.map((fact) => (
              <li key={fact} className="flex items-center gap-2.5">
                <span aria-hidden className="size-[5px] rotate-45 bg-gold-dark" />
                {fact}
              </li>
            ))}
            {openNow !== null && (
              <li className="sm:ml-auto">
                <span
                  className={
                    openNow
                      ? "inline-flex items-center gap-2 bg-ok-soft px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-ok-soft-fg uppercase"
                      : "inline-flex items-center gap-2 bg-brown-950/6 px-3 py-1 text-[0.6875rem] font-semibold tracking-[0.12em] text-taupe uppercase"
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
          <div className="relative mx-auto max-w-md lg:max-w-none">
            {/* The 4:5 plate is the intent, but on a short laptop window a
                616px-tall photo pushes its own caption past the fold and the
                card renders sliced. Above `lg` the frame is therefore capped to
                what the viewport can actually show; `object-cover` takes the
                crop off the top and bottom, so the picture stays a picture
                rather than squashing. Left unscoped below `lg`, where the photo
                stacks under the copy and the fold is irrelevant. */}
            <ParallaxMedia
              className="aspect-4/5 bg-paper-warm lg:max-h-[calc(100dvh_-_11rem)]"
              distance={56}
            >
              <Image
                src="/images/coppa-finocchio-bottega.jpg"
                alt="Coppa al finocchietto affettata sul tagliere, in bottega"
                fill
                preload
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover"
              />
            </ParallaxMedia>

            {/* The caption a picture in a magazine would carry. It also tells the
                visitor what they are looking at, which an unlabelled food
                photograph never does. */}
            <div className="absolute right-6 -bottom-4 left-6 border border-rule bg-paper px-4 py-3 shadow-[0_18px_40px_-24px_rgba(42,26,16,0.5)] sm:right-8 sm:left-8">
              <span className="block text-[0.625rem] sm:text-[0.5625rem] font-semibold tracking-[0.26em] text-gold-deep uppercase">
                Al banco oggi
              </span>
              <span className="mt-1 block text-[0.8125rem] leading-snug text-brown-700">
                Coppa al finocchietto, tagliata al momento
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
