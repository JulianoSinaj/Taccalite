import Link from "next/link";
import { ArrowRight } from "lucide-react";
import ProductTile, { type ProductTileData } from "@/components/site/ProductTile";
import Reveal from "@/components/Reveal";

export default function ProdottiMigliori({ products }: { products: ProductTileData[] }) {
  if (products.length === 0) return null;

  return (
    <section className="bg-paper px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <div className="flex flex-col justify-between gap-7 border-b border-rule pb-10 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              Dal banco
            </p>
            <h2 className="font-display display-lg mt-7 max-w-2xl font-semibold text-brown-950">
              I prodotti <span className="wonk text-gold-deep">migliori</span>
            </h2>
          </div>
          <Link
            href="/negozio"
            className="group inline-flex shrink-0 items-center gap-3 border-b border-gold/50 pb-1 text-[0.6875rem] font-semibold tracking-[0.2em] text-brown-950 uppercase transition-[gap,color] duration-500 hover:gap-5 hover:text-gold-deep focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            Tutto lo shop
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {/* Scroll-snapped row on a phone, grid from the small breakpoint up. A
            carousel beats a 2-up grid here: the prices stay comparable side by
            side instead of stacking into a wall. */}
        <div className="-mx-5 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-7 sm:gap-y-14 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {products.map((product, i) => (
            <Reveal
              key={product.slug}
              delay={i * 0.06}
              className="w-[68vw] shrink-0 snap-start sm:w-auto sm:shrink"
            >
              <ProductTile product={product} />
            </Reveal>
          ))}
        </div>

        <p className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] text-taupe">
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
