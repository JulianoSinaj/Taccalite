import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * What's on the counter today.
 *
 * The one part of the homepage that changes daily, so it reads as a shop that
 * is open right now rather than a brochure. Content comes from the `home.today`
 * setting — the owner types a line in the gestionale each morning and it is live
 * immediately. Empty setting, no band: an out-of-date "today" is worse than none.
 *
 * Set as a **day-sheet**, not an announcement bar. Three things were wrong with
 * the bar it replaces: it sat on `paper-warm` between the hero's `paper-warm`
 * proof row and ChiSiamo's `paper-warm` ground, so it had no edges of its own;
 * the items were strung together with little gold diamonds, which reads as one
 * run-on sentence rather than a list of four things; and nothing in it was dark
 * enough to be the thing you looked at.
 *
 * So: the ground steps down to `paper-deep` — the one step neither neighbour
 * uses, which is what gives the band edges without a heavier rule. The label is
 * a stamped tab, the only ink block in the top third of the page, so the eye
 * lands on "today" before it reads the items. And the items become a **ruled
 * table**: a cell each, a struck numeral, hairlines between them, flush to both
 * margins so the row spans the measure the way a printed listing does.
 *
 * The cells share the measure equally (`basis-0`) and the table keeps the full
 * width to itself — sharing a line with the label and the link is what cost the
 * old list about 40% of its width. At 1512px four cells of ~330px hold their
 * items on one line each; six still fit, at two lines apiece.
 */
export default function OggiAlBanco({
  items,
  dateLabel,
}: {
  items: string[];
  dateLabel: string;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="oggi-heading" className="border-y border-rule-strong bg-paper-deep">
      <div className="mx-auto max-w-[88rem] px-5 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 py-3.5 sm:py-4">
          <h2
            id="oggi-heading"
            className="inline-flex items-center gap-2.5 bg-brown-950 px-3.5 py-2 text-[0.6875rem] font-semibold tracking-[0.24em] text-cream uppercase"
          >
            {/* A live pulse, because this really is today's data. */}
            <span aria-hidden className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-gold" />
            </span>
            Oggi al banco
          </h2>

          <span className="text-[0.8125rem] text-taupe">{dateLabel}</span>

          <Link
            href="/negozio"
            className="tap group inline-flex items-center gap-3 border-b border-gold/60 pb-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-brown-950 uppercase transition-[gap,color] duration-500 hover:gap-5 hover:text-gold-deep focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none sm:ml-auto"
          >
            Ordina online
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {/* Ordered, because the numerals are load-bearing: they are what makes
            the row read as a countable list rather than a sentence, and they
            replace the diamonds that used to float between the items. */}
        <ol className="flex flex-col divide-y divide-rule border-t border-rule lg:flex-row lg:divide-x lg:divide-y-0">
          {items.map((item, i) => (
            <li
              key={item}
              className="flex min-w-0 items-baseline gap-3.5 py-3 lg:flex-1 lg:basis-0 lg:px-6 lg:py-4 lg:first:pl-0 lg:last:pr-0"
            >
              <span
                aria-hidden
                className="font-display shrink-0 text-[0.75rem] font-semibold text-gold-deep tabular-nums"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-[1.0625rem] leading-tight font-semibold tracking-[-0.015em] text-balance text-brown-950 sm:text-[1.125rem]">
                {item}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
