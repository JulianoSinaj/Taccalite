import type { ReactNode } from "react";

type NoticeScreenProps = {
  eyebrow: string;
  title: ReactNode;
  body: ReactNode;
  /** Set huge and hollow behind the notice — "404", "500". */
  ghost: string;
  children: ReactNode;
};

/**
 * The shape every dead end takes: not found, errored, nothing here.
 *
 * These pages used to be a centred paragraph and two gold pills on bare cream —
 * the one place a visitor is already frustrated, and the only screens on the
 * site with no art direction at all. Same furniture as the rest of the
 * storefront now, with the status code set as a hollow numeral the way `1946`
 * is on the homepage: it says which wall you hit without shouting it.
 *
 * The display size is written out rather than taken from `.display-lg`, because
 * `app/not-found.tsx` also answers for the gestionale — outside `.site-shell`
 * that class does not exist, and the headline would have rendered at 16px with
 * nothing to say it had.
 */
export default function NoticeScreen({
  eyebrow,
  title,
  body,
  ghost,
  children,
}: NoticeScreenProps) {
  return (
    <main className="relative flex flex-1 items-center overflow-hidden px-5 pt-32 pb-24 sm:px-8 sm:pt-40 lg:px-12">
      <span
        aria-hidden
        className="font-display pointer-events-none absolute -right-8 bottom-0 text-[30vw] leading-[0.72] font-semibold tracking-[-0.06em] text-transparent select-none sm:-right-12"
        style={{ WebkitTextStroke: "1px rgba(42,26,16,0.08)" }}
      >
        {ghost}
      </span>

      <div className="relative mx-auto w-full max-w-[88rem]">
        <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
          <span aria-hidden className="h-px w-10 bg-gold" />
          {eyebrow}
        </p>

        <h1 className="font-display mt-8 max-w-2xl text-[clamp(2.4rem,5.5vw,4.6rem)] leading-[0.96] font-semibold tracking-[-0.028em] text-brown-950">
          {title}
        </h1>

        <p className="mt-8 max-w-md text-lg leading-relaxed text-brown-700">{body}</p>

        <div className="mt-11 flex flex-wrap items-center gap-3">{children}</div>
      </div>
    </main>
  );
}
