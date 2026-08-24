import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import RevealLines from "./RevealLines";

type PageHeroProps = {
  eyebrow: string;
  /** Optional line *above* the eyebrow — a breadcrumb trail, a back link. */
  trail?: ReactNode;
  /** One entry per visual line, so the break is a design choice not an accident. */
  title: ReactNode[];
  lede?: ReactNode;
  /** Optional right-hand column: a framed photo, a form, a stat block. */
  aside?: ReactNode;
  /** Extra content under the lede — buttons, a filter row. */
  children?: ReactNode;
  className?: string;
};

/**
 * The opening band shared by every inner page.
 *
 * White, like the rest of the paper. The pages this replaced each opened with a
 * near-black slab, which was the single thing the brief was most explicit about
 * removing — and which also meant the fixed white header sat on a dark ground
 * and read as a grey bar floating over the page.
 *
 * Laid out as a masthead when there is no `aside`: headline left, lede set in a
 * measure on the right, closed by a rule. Previously the lede sat under the
 * title and the right-hand third of every inner page was empty — a void the
 * width of a column, on every page but the homepage.
 */
export default function PageHero({
  eyebrow,
  trail,
  title,
  lede,
  aside,
  children,
  className,
}: PageHeroProps) {
  return (
    // `pt-28` on a phone: the fixed header is 76px there, not the 110px the
    // desktop's 8rem was clearing, so a third of the gap was measured against
    // chrome that is not on the screen. Together with the tighter margins below,
    // this brings the first row of an inner page — the products on /negozio, the
    // shops on /sedi — up above the fold.
    <section className={cn("px-5 pt-28 pb-10 sm:px-8 sm:pt-40 sm:pb-20 lg:px-12", className)}>
      <div
        className={cn(
          "mx-auto max-w-[88rem]",
          aside && "grid items-center gap-14 lg:grid-cols-12 lg:gap-12"
        )}
      >
        <div className={cn(aside && "lg:col-span-7")}>
          {trail && <div className="mb-5">{trail}</div>}
          <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            {eyebrow}
          </p>

          {aside ? (
            <>
              <h1 className="font-display display-xl mt-5 font-semibold text-brown-950 sm:mt-8">
                <RevealLines immediate lines={title} />
              </h1>
              {lede && (
                <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-brown-700 sm:mt-8 sm:text-lg">
                  {lede}
                </p>
              )}
            </>
          ) : (
            <div className="mt-5 grid gap-5 border-b border-rule pb-7 sm:mt-8 sm:gap-8 sm:pb-10 lg:grid-cols-12 lg:items-end lg:gap-12">
              <h1 className="font-display display-xl font-semibold text-brown-950 lg:col-span-8">
                <RevealLines immediate lines={title} />
              </h1>
              {lede && (
                <p className="text-[1.0625rem] leading-relaxed text-brown-700 sm:text-lg lg:col-span-4 lg:pb-2 lg:text-base">
                  {lede}
                </p>
              )}
            </div>
          )}

          {children}
        </div>

        {aside && <div className="lg:col-span-5">{aside}</div>}
      </div>
    </section>
  );
}
