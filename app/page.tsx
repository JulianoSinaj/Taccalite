import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import SplitHero from "@/components/SplitHero";
import StickyBuyBar from "@/components/StickyBuyBar";
import ScrollFilm from "@/components/ScrollFilm";
import PillButton from "@/components/PillButton";
import FloatCard from "@/components/FloatCard";
import ScrollDrift from "@/components/ScrollDrift";
import WorldBento from "@/components/WorldBento";
import { featuredProducts } from "@/lib/data";

const productImages: Record<string, string> = {
  "porchetta-artigianale":
    "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=80&w=800",
  "ciauscolo-igp": "/images/negozio-carni-prosciutto.jpg",
  "pecorino-di-fossa":
    "https://images.unsplash.com/photo-1452195100486-9cc805987862?auto=format&fit=crop&q=80&w=800",
  "bistecca-marchigiana":
    "https://images.unsplash.com/photo-1615937657715-bc7b4b7962c1?auto=format&fit=crop&q=80&w=800",
};

export default function Home() {
  return (
    <>
      <SplitHero />
      <StickyBuyBar />

      {/* Atto II — il processo, scrubbed dallo scroll */}
      <ScrollFilm />

      {/* La dispensa — 4-column product grid */}
      <section className="bg-cream px-5 py-16 sm:px-12 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col justify-between gap-8 sm:mb-16 md:flex-row md:items-end">
            <div className="space-y-5">
              <span className="eyebrow eyebrow-dark block">Selezione premium</span>
              <h2 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl md:text-7xl">
                I tesori della dispensa
              </h2>
            </div>
            <Link
              href="/negozi"
              className="group flex items-center gap-4 text-[11px] font-bold tracking-[0.3em] text-brown-950 uppercase transition-colors hover:text-gold-deep"
            >
              Vieni a scoprirli in negozio
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-2" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-10 lg:grid-cols-4">
            {featuredProducts.map((product, i) => (
              <ScrollDrift key={product.slug} index={i}>
                <FloatCard className="rounded-lg">
                  <Link
                    href={`/negozi/${product.shopSlug}`}
                    className="group block h-full overflow-hidden rounded-lg border border-brown-900/10 bg-white/60"
                  >
                    <div className="relative aspect-[4/5] overflow-hidden">
                      <Image
                        src={productImages[product.slug]}
                        alt={product.name}
                        fill
                        className="object-cover transition-transform duration-[1.5s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                        sizes="(max-width: 1024px) 50vw, 25vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-brown-950/30 to-transparent" />
                    </div>
                    <div className="space-y-1.5 p-4 sm:space-y-2 sm:p-6">
                      <p className="text-[10px] font-bold tracking-widest text-gold-deep uppercase">
                        {product.category}
                      </p>
                      <h3 className="font-display text-lg text-brown-950 sm:text-2xl">{product.name}</h3>
                      <span className="inline-flex items-center gap-2 pt-1 text-xs font-bold text-gold-deep transition-all group-hover:gap-4 sm:pt-2 sm:text-sm">
                        Dettagli
                        <ArrowRight className="size-4" />
                      </span>
                    </div>
                  </Link>
                </FloatCard>
              </ScrollDrift>
            ))}
          </div>
        </div>
      </section>

      {/* Atto III — il mondo Taccalite, bento */}
      <WorldBento />

      {/* Atto IV — chiusura */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 py-16 sm:px-12 sm:py-24">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -right-40 -bottom-52 h-[44rem] w-[44rem] opacity-10" />
        <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-10 text-center">
          <h2 className="font-display max-w-3xl text-4xl leading-[0.95] tracking-tighter text-cream sm:text-6xl">
            Il sabato la porchetta esce calda dal forno.
            <span className="text-gold italic"> Non fartela scappare.</span>
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <PillButton href="/prenotazioni" tone="gold">
              Riserva la tua porzione
            </PillButton>
            <PillButton href="/account" tone="ghost">
              Entra nel Club Taccalite
            </PillButton>
          </div>
        </div>
      </section>
    </>
  );
}
