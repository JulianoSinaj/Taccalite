import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ProductTile, { type ProductTileData } from "@/components/site/ProductTile";
import Reveal from "@/components/Reveal";

export default function ProdottiMigliori({ products }: { products: ProductTileData[] }) {
  if (products.length === 0) return null;

  return (
    <section className="bg-paper px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <div className="flex flex-col justify-between gap-5 border-b border-rule pb-7 sm:gap-7 sm:pb-10 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              Dal banco
            </p>
            <h2 className="font-display display-lg mt-5 max-w-2xl font-semibold text-brown-950 sm:mt-7">
              I prodotti <span className="wonk text-gold-deep">migliori</span>
            </h2>
          </div>
          <Link
            href="/negozio"
            className="tap group inline-flex shrink-0 items-center gap-3 self-start border-b border-gold/50 pb-1 text-[0.6875rem] font-semibold tracking-[0.2em] text-brown-950 uppercase transition-[gap,color] duration-500 hover:gap-5 hover:text-gold-deep focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            Tutto lo shop
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {/* Scroll-snapped row on a phone, grid from the small breakpoint up. A
            carousel beats a 2-up grid here: the prices stay comparable side by
            side instead of stacking into a wall.
            `scroll-pl-5` matches the page gutter, so a snapped tile lands flush
            with the headline above it rather than hard against the screen edge;
            `no-scrollbar` removes the grey bar that otherwise sits under the
            last row of type and reads as a rule belonging to nothing. */}
        <div className="no-scrollbar -mx-5 mt-9 flex snap-x snap-mandatory scroll-pl-5 gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:mt-12 sm:grid sm:grid-cols-2 sm:gap-x-7 sm:gap-y-14 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {products.map((product, i) => (
            <Reveal
              key={product.slug}
              delay={i * 0.06}
              // 72vw rather than 68: at 375px the next tile still shows a
              // 90px sliver, which is what says "swipe" — but the tile itself
              // gains 15px, and at this size that is a whole word of the name.
              className="w-[72vw] shrink-0 snap-start sm:w-auto sm:shrink"
            >
              <ProductTile product={product} />
            </Reveal>
          ))}
        </div>

        <p className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] text-taupe sm:mt-12">
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="size-[3px] rounded-full bg-gold" />
            Ritiro in bottega in giornata
          </span>
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="size-[3px] rounded-full bg-gold" />
            Tagliato al momento
          </span>
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="size-[3px] rounded-full bg-gold" />
            Pagamento sicuro
          </span>
        </p>
      </div>
    </section>
  );
}
