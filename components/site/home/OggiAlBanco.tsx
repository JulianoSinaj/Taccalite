import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * What's on the counter today.
 *
 * The one part of the homepage that changes daily, so it reads as a shop that
 * is open right now rather than a brochure. Content comes from the `home.today`
 * setting — the owner types a line in the gestionale each morning and it is live
 * immediately. Empty setting, no band: an out-of-date "today" is worse than none.
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
    <section aria-labelledby="oggi-heading" className="border-y border-rule bg-paper-warm">
      <div className="mx-auto flex max-w-[88rem] flex-col gap-5 px-5 py-6 sm:px-8 lg:flex-row lg:items-center lg:gap-10 lg:px-12">
        <div className="flex shrink-0 items-center gap-3.5">
          {/* A live pulse, because this really is today's data. */}
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-gold opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-gold-deep" />
          </span>
          <h2
            id="oggi-heading"
            className="text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase"
          >
            Oggi al banco
          </h2>
          <span className="text-[0.8125rem] text-taupe">{dateLabel}</span>
        </div>

        <ul className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2">
          {items.map((item, i) => (
            <li key={item} className="flex items-center gap-5">
              {i > 0 && <span aria-hidden className="size-1 rotate-45 bg-gold" />}
              <span className="font-display text-[1.0625rem] leading-tight font-semibold tracking-[-0.015em] text-brown-950 sm:text-[1.125rem]">
                {item}
              </span>
            </li>
          ))}
        </ul>

        <Link
          href="/negozio"
          className="group inline-flex shrink-0 items-center gap-3 self-start border-b border-gold/50 pb-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-brown-950 uppercase transition-[gap,color] duration-500 hover:gap-5 hover:text-gold-deep focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none lg:self-auto"
        >
          Ordina online
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
