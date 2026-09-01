import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Reveal from "@/components/Reveal";

/**
 * Numbered because the list is a sequence the customer actually walks: what you
 * take away today, what you have delivered, what you book ahead. Five identical
 * cards would have said none of that — and would have forced five descriptions
 * of the same length, which these are not.
 */
export type Servizio = {
  title: string;
  body: string;
  href: string;
  cta: string;
  accent: string;
  /** Optional: a row the shop widened before this field existed has none. */
  image?: string;
  /** Optional, same reason as `image`: a quieter second line under the body. */
  note?: string;
};

export default function Servizi({ servizi }: { servizi: Servizio[] }) {
  return (
    <section className="bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <div className="flex flex-col justify-between gap-7 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              Cosa facciamo per voi
            </p>
            <h2 className="font-display display-lg mt-7 max-w-2xl font-semibold text-brown-950">
              I nostri <span className="wonk text-gold-deep">servizi</span>
            </h2>
          </div>
          {/* A small framed card rather than a bare paragraph: the promise
              this section makes gets its own printed panel, corner-stamped
              like a wax seal — a smaller echo of the shop's mark (SealSvg)
              rather than the mark itself, which stays reserved for the hero
              and the intro veil. */}
          <div className="relative mt-3 max-w-sm rounded-sm border border-rule bg-paper px-7 py-6 shadow-[0_1px_2px_rgba(42,26,16,0.05)]">
            <span
              aria-hidden
              className="absolute inset-[3px] rounded-[1px] border border-gold/15"
            />
            <span
              aria-hidden
              className="font-display absolute -top-4 -left-4 flex size-9 items-center justify-center rounded-full border border-gold bg-paper-warm text-lg text-gold-deep shadow-[0_1px_3px_rgba(42,26,16,0.15)]"
            >
              &ldquo;
            </span>
            <p className="relative text-base leading-relaxed text-brown-700">
              <span className="wonk font-display text-lg text-gold-deep">Oltre al banco:</span>{" "}
              quello che possiamo preparare, consegnare o tenere da parte per voi.
            </p>
          </div>
        </div>

        <ol className="mt-14 border-t border-rule md:-mx-6">
          {servizi.map((servizio, i) => (
            <Reveal key={servizio.title} delay={i * 0.05}>
              <li
                className="border-b border-rule"
                style={{ "--acc": servizio.accent } as React.CSSProperties}
              >
                <Link
                  href={servizio.href}
                  className="group relative grid items-baseline gap-x-8 gap-y-3 px-4 py-9 transition-colors duration-500 focus-visible:outline-none md:grid-cols-[4rem_minmax(0,15rem)_1fr_auto] lg:grid-cols-[4rem_minmax(0,18rem)_1fr_auto] md:px-6 md:py-11 hover:bg-[color-mix(in_oklab,var(--acc)_7%,transparent)]"
                >
                  {/* The row number, struck huge and ghosted, arriving from the
                      right on hover. Five identical rows had no reward for
                      touching one; this gives each its own colour and a gesture
                      that belongs to it. */}
                  <span
                    aria-hidden
                    className="font-display pointer-events-none absolute top-1/2 right-6 hidden -translate-y-1/2 translate-x-6 text-[7rem] leading-none font-semibold tracking-[-0.05em] text-[color-mix(in_oklab,var(--acc)_16%,transparent)] opacity-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] select-none group-hover:translate-x-0 group-hover:opacity-100 lg:block"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <span className="relative font-display text-[0.9375rem] font-semibold text-[var(--acc)] tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="relative">
                    <h3 className="font-display text-[1.75rem] leading-none font-semibold tracking-[-0.025em] text-brown-950 transition-colors duration-500 group-hover:text-[var(--acc)] md:text-[2.125rem]">
                      {servizio.title}
                    </h3>

                    {/* A photograph under the name, kept small on purpose: the
                        row is a list, not a card grid, and a picture the width
                        of the column would have turned five rows into five
                        posters. Decorative — `alt=""` — because the link is
                        already announced by the title and the CTA beside it. */}
                    {servizio.image && (
                      <div className="relative mt-5 aspect-3/2 w-[12rem] overflow-hidden bg-paper md:w-full">
                        <Image
                          src={servizio.image}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 18rem, (min-width: 768px) 15rem, 12rem"
                          className="object-cover transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                        />
                        <span
                          aria-hidden
                          className="absolute inset-0 border border-brown-950/8 transition-colors duration-500 group-hover:border-[color-mix(in_oklab,var(--acc)_55%,transparent)]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="relative max-w-xl self-start md:mt-16 lg:mt-20">
                    <p className="text-base leading-relaxed text-brown-700">{servizio.body}</p>

                    {/* The afterthought line — the thing the person behind the
                        counter adds once you've said yes. Set quieter and led
                        by a short rule in the row's own colour, so it reads as
                        a footnote to the description rather than a second
                        paragraph competing with it. */}
                    {servizio.note && (
                      <p className="mt-3 flex gap-3 text-[0.9375rem] leading-relaxed text-brown-700/70">
                        <span
                          aria-hidden
                          className="mt-[0.7em] h-px w-4 shrink-0 bg-[color-mix(in_oklab,var(--acc)_50%,transparent)]"
                        />
                        {servizio.note}
                      </p>
                    )}
                  </div>

                  <span className="relative flex items-center gap-2.5 text-[0.6875rem] font-semibold tracking-[0.18em] text-brown-950 uppercase transition-[gap] duration-500 group-hover:gap-4">
                    {servizio.cta}
                    <ArrowUpRight className="size-4 text-[var(--acc)]" aria-hidden />
                  </span>

                  <span
                    aria-hidden
                    className="rule-draw pointer-events-none absolute inset-x-0 -bottom-px h-px"
                  />
                </Link>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
