import type { ReactNode } from "react";

/** Shared reading shell for legal/policy pages. */
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
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-40 pb-16 sm:px-10 sm:pt-52 sm:pb-24">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="relative mx-auto max-w-3xl">
          <span className="eyebrow mb-6 block">Informazioni legali</span>
          <h1 className="font-display text-4xl leading-[1.02] tracking-tighter text-cream sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-6 text-sm font-semibold tracking-widest text-cream/60 uppercase">
            Ultimo aggiornamento: {updated}
          </p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl space-y-8 px-5 py-20 text-brown-900/85 sm:px-8 sm:py-28 [&_a]:font-semibold [&_a]:text-gold-deep [&_a]:underline [&_h2]:font-display [&_h2]:text-2xl [&_h2]:tracking-tight [&_h2]:text-brown-950 sm:[&_h2]:text-3xl [&_h2]:pt-4 [&_li]:leading-relaxed [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </article>
    </div>
  );
}
