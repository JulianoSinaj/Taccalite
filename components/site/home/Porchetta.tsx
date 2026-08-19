import CTA from "@/components/site/CTA";
import RevealLines from "@/components/site/RevealLines";
import SaturdayCountdown from "@/components/SaturdayCountdown";

/**
 * The first of the page's two brown bands. No photograph on purpose: the only
 * porchetta shots on file are stock, and a typographic block carries more
 * authority than a picture of somebody else's roast.
 */
export default function Porchetta() {
  return (
    <section className="relative overflow-hidden bg-brown-950 px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
      <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.07]" />
      <div aria-hidden className="parallax-orb absolute -top-64 -right-52 h-[46rem] w-[46rem] opacity-[0.14]" />

      <div className="relative mx-auto grid max-w-[88rem] gap-16 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold uppercase">
            <span aria-hidden className="h-px w-10 bg-gold/60" />
            La specialità della casa
          </p>

          <h2 className="font-display display-lg mt-8 font-semibold text-cream">
            <RevealLines
              lines={[
                "La nostra porchetta",
                <span key="2" className="wonk text-gold">
                  artigianale.
                </span>,
              ]}
            />
          </h2>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-cream/70">
            Rosmarino, aglio, finocchietto selvatico e una cottura lenta che non si può
            accelerare. Esce dal forno il sabato mattina, e finisce sempre. Chi la conosce
            la prenota entro il venerdì.
          </p>

          <div className="mt-11 flex flex-wrap items-center gap-3">
            <CTA href="/porchetta" tone="gold">
              Scopri di più
            </CTA>
            <CTA href="/prenotazioni" tone="onDark">
              Prenota la tua porzione
            </CTA>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="border-t border-cream/12 pt-8">
            <p className="text-[0.625rem] font-semibold tracking-[0.24em] text-cream/50 uppercase">
              La prossima infornata tra
            </p>
            <div className="mt-6">
              <SaturdayCountdown />
            </div>
            <p className="mt-8 text-[0.8125rem] text-cream/45">
              Sabato mattina · Piazza Kennedy · fino a esaurimento
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
