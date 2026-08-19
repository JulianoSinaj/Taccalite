import CTA from "@/components/site/CTA";
import RevealLines from "@/components/site/RevealLines";
import SaturdayCountdown from "@/components/SaturdayCountdown";

/**
 * The first of the page's two brown bands. No photograph on purpose: the only
 * porchetta shots on file are stock, and a typographic block carries more
 * authority than a picture of somebody else's roast.
 *
 * What the band *does* need is heat. It used to be flat brown with one blurred
 * gold orb and an empty right half, so the loudest section of the page was also
 * its quietest surface. The ember wash lights it, and the recipe now occupies
 * the space the countdown was rattling around in — the four things that go into
 * a porchetta, set as a list, which is the closest thing to a photograph that
 * costs nothing and is entirely true.
 */

const ricetta = [
  { name: "Rosmarino", note: "a rametti interi" },
  { name: "Aglio", note: "in camicia" },
  { name: "Finocchietto", note: "selvatico, raccolto qui" },
  { name: "Cottura lenta", note: "dalle cinque del mattino" },
];

export default function Porchetta() {
  return (
    <section className="relative overflow-hidden bg-brown-950 px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
      <div aria-hidden className="ember absolute inset-0" />
      <div aria-hidden className="bg-noise absolute inset-0 opacity-[0.07]" />

      <div className="relative mx-auto grid max-w-[88rem] gap-16 lg:grid-cols-12 lg:gap-14">
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

          {/* The recipe as a ledger. Four rules, four hairlines: the section had
              a whole column of nothing under the paragraph, and this is what the
              shop would have written on the card in the window. */}
          <ol className="mt-12 max-w-xl border-t border-cream/12">
            {ricetta.map((step, i) => (
              <li
                key={step.name}
                className="flex items-baseline gap-5 border-b border-cream/12 py-4"
              >
                <span className="font-display text-[0.8125rem] font-semibold text-gold/70 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-display text-[1.375rem] leading-none font-semibold tracking-[-0.02em] text-cream">
                  {step.name}
                </span>
                <span className="ml-auto text-right text-[0.8125rem] text-cream/45">
                  {step.note}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-11 flex flex-wrap items-center gap-3">
            <CTA href="/porchetta" tone="gold">
              Scopri di più
            </CTA>
            <CTA href="/prenotazioni" tone="onDark">
              Prenota la tua porzione
            </CTA>
          </div>
        </div>

        <div className="lg:col-span-5 lg:col-start-8">
          {/* Given a ground of its own so the countdown reads as an instrument
              on the wall rather than four numbers adrift in a dark rectangle. */}
          <div className="flex h-full flex-col border border-cream/12 bg-brown-950/45 p-8 backdrop-blur-sm sm:p-10">
            <p className="text-[0.625rem] font-semibold tracking-[0.24em] text-gold uppercase">
              La prossima infornata tra
            </p>

            <div className="mt-7 pb-9">
              <SaturdayCountdown />
            </div>

            <div className="mt-auto space-y-3 border-t border-cream/12 pt-7 text-[0.8125rem] text-cream/55">
              <p className="flex items-center justify-between gap-4">
                <span>Quando</span>
                <span className="text-cream/85">Sabato mattina, dalle 9</span>
              </p>
              <p className="flex items-center justify-between gap-4">
                <span>Dove</span>
                <span className="text-cream/85">Piazza Kennedy, 10</span>
              </p>
              <p className="flex items-center justify-between gap-4">
                <span>Quanta</span>
                <span className="text-cream/85">40 kg, fino a esaurimento</span>
              </p>
            </div>

            <p className="mt-8 flex items-center gap-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-gold uppercase">
              <span aria-hidden className="size-1.5 rounded-full bg-gold" />
              Prenota entro venerdì
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
