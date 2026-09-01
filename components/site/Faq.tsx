import type { ReactNode } from "react";
import Reveal from "@/components/Reveal";
import { SectionMark } from "@/components/site/sedi/Ornaments";
import { cn } from "@/lib/utils";

/** One question and its answer, in the order the page lists them. */
export type FaqItem = { question: string; answer: string };

/**
 * The shop's answers, as a band.
 *
 * There were two of these already — one written out in `/sedi`, one that existed
 * only as `faqSchema` on `/porchetta` and was never drawn, which is both a wasted
 * section and structured data describing text no visitor can read. This is that
 * band, once: a head that says whose questions these are, the questions
 * themselves, and the way to ask one that isn't listed.
 *
 * `<details>` rather than a state hook, so the accordion works before hydration,
 * survives it, prints open-able, and is found by the browser's own in-page
 * search — none of which a `useState` version does, and it stays a server
 * component into the bargain.
 */
export default function Faq({
  items,
  id = "faq",
  mark,
  eyebrow = "Domande frequenti",
  title,
  intro,
  aside,
  className,
}: {
  items: FaqItem[];
  id?: string;
  /** Ordinal for the printer's mark, when the page numbers its sections. */
  mark?: string;
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  /** Whatever helps somebody whose question isn't here — phone numbers, a CTA. */
  aside?: ReactNode;
  className?: string;
}) {
  // A row with no question is an empty summary: nothing to read and nothing to
  // click. A row with no answer stays, half-filled and visible, so whoever left
  // it unfinished in Gestionale → Testi del sito can see what they left.
  const rows = items.filter((item) => item.question);
  if (rows.length === 0) return null;

  return (
    <section
      id={id}
      className={cn("scroll-mt-24 bg-paper px-5 py-12 sm:px-8 sm:py-20 lg:px-12", className)}
    >
      {/* Three cells rather than two, placed explicitly on the wide screen: the
          list spans both rows of the right-hand column while the head and the
          "chiedete a noi" block stack down the left. Two cells would have put a
          pair of phone numbers between the reader and the first question on a
          phone — and on a phone the questions are the band, the fallback being
          what you reach for after them. */}
      <div className="mx-auto grid max-w-[88rem] grid-cols-1 gap-x-20 gap-y-10 lg:grid-cols-12">
        <Reveal className="lg:col-span-4 lg:col-start-1 lg:row-start-1">
          {mark ? (
            <SectionMark n={mark} className="mb-6">
              {eyebrow}
            </SectionMark>
          ) : (
            <p className="mb-6 flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              {eyebrow}
            </p>
          )}
          <h2 className="font-display display-lg font-semibold text-brown-950">{title}</h2>
          {intro && <p className="mt-6 text-sm leading-relaxed text-brown-700">{intro}</p>}
        </Reveal>

        <Reveal delay={0.1} className="lg:col-span-8 lg:col-start-5 lg:row-span-2 lg:row-start-1">
          <div className="divide-y divide-rule border-y border-rule">
            {rows.map((item, i) => (
              <details key={item.question} className="group py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-left [&::-webkit-details-marker]:hidden">
                  <span className="flex items-baseline gap-4">
                    <span
                      aria-hidden
                      className="font-display text-sm font-semibold text-brown-950/25 tabular-nums"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-display text-xl leading-snug tracking-tight text-brown-950 sm:text-2xl">
                      {item.question}
                    </span>
                  </span>
                  {/* A plus that becomes a minus: the second stroke turns, so the
                      state change is a movement rather than a swapped glyph. */}
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rule-strong text-brown-950 transition-colors duration-500 group-open:bg-brown-950 group-open:text-cream">
                    <span className="absolute h-[1.5px] w-3.5 bg-current" />
                    <span className="absolute h-3.5 w-[1.5px] bg-current transition-transform duration-500 group-open:rotate-90" />
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 pl-9 text-base leading-relaxed text-brown-700">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </Reveal>

        {aside && (
          <Reveal delay={0.15} className="lg:col-span-4 lg:col-start-1 lg:row-start-2">
            {aside}
          </Reveal>
        )}
      </div>
    </section>
  );
}
