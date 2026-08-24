import type { ReactNode } from "react";

/**
 * Shared reading shell for legal/policy pages.
 *
 * These were the last pages opening on a near-black slab — the one thing the
 * storefront brief was most explicit about removing, and by now the only place
 * left doing it, so the privacy page announced itself as a different website.
 * Masthead on paper like everything else, and the measure set once so the
 * heading, the date and the prose share a left edge.
 */
export default function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div>
      <section className="px-5 pt-28 pb-10 sm:px-8 sm:pt-32 lg:px-12">
        <div className="mx-auto max-w-[46rem]">
          <p className="eyebrow eyebrow-dark">Informazioni legali</p>
          <h1 className="font-display display-lg mt-8 font-semibold text-brown-950">{title}</h1>
          <p className="mt-8 border-t border-rule pt-6 text-[0.6875rem] font-semibold tracking-[0.18em] text-taupe uppercase">
            Ultimo aggiornamento: {updated}
          </p>
        </div>
      </section>

      <article className="mx-auto max-w-[46rem] space-y-8 px-5 pb-16 text-brown-700 sm:px-8 sm:pb-20 [&_a]:font-semibold [&_a]:text-gold-deep [&_a]:underline [&_h2]:font-display [&_h2]:pt-6 [&_h2]:text-[1.5rem] [&_h2]:leading-tight [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-brown-950 [&_li]:leading-relaxed [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </article>
    </div>
  );
}
