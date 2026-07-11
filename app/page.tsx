import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import SplitHero from "@/components/SplitHero";
import PillButton from "@/components/PillButton";
import FloatCard from "@/components/FloatCard";
import ScrollDrift from "@/components/ScrollDrift";
import BlogCard from "@/components/BlogCard";
import { shops, featuredProducts, blogPosts } from "@/lib/data";

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

      {/* La dispensa — 4-column product grid */}
      <section className="bg-cream px-6 py-24 sm:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div className="space-y-5">
              <span className="eyebrow eyebrow-dark block">Selezione premium</span>
              <h2 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl md:text-7xl">
                I tesori della dispensa
              </h2>
            </div>
            <Link
              href="/negozi"
              className="group flex items-center gap-4 text-[11px] font-bold tracking-[0.3em] text-brown-950 uppercase transition-colors hover:text-gold-dark"
            >
              Vieni a scoprirli in negozio
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-2" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
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
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-brown-950/30 to-transparent" />
                    </div>
                    <div className="space-y-2 p-6">
                      <p className="text-[10px] font-bold tracking-widest text-taupe uppercase">
                        {product.category}
                      </p>
                      <h3 className="font-display text-2xl text-brown-950">{product.name}</h3>
                      <span className="inline-flex items-center gap-2 pt-2 text-sm font-bold text-gold-dark transition-all group-hover:gap-4">
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

      {/* Le sedi — 3-column balanced grid: two shops + booking card */}
      <section className="bg-cream-dark px-6 py-24 sm:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 space-y-5 text-center">
            <span className="eyebrow eyebrow-dark block">Le nostre sedi</span>
            <h2 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl md:text-7xl">
              Due negozi, una famiglia
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {shops.map((shop, i) => (
              <ScrollDrift key={shop.slug} index={i}>
                <FloatCard className="rounded-lg">
                  <Link
                    href={`/negozi/${shop.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-lg border border-brown-900/10 bg-white/60"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <Image
                        src={shop.image}
                        alt={shop.name}
                        fill
                        className="object-cover transition-transform duration-[1.5s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-brown-950/40 to-transparent" />
                      <span className="absolute top-5 left-5 rounded-full bg-cream/90 px-4 py-1.5 text-[10px] font-bold tracking-widest text-brown-950 uppercase backdrop-blur">
                        {shop.specialty}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col space-y-4 p-6">
                      <h3 className="font-display text-3xl text-brown-950">{shop.name}</h3>
                      <p className="flex-1 text-sm leading-relaxed text-brown-900/60">
                        {shop.tagline}
                      </p>
                      <div className="space-y-2 text-xs font-semibold text-taupe">
                        <p className="flex items-center gap-2">
                          <MapPin className="size-3.5 shrink-0 text-gold-dark" />
                          {shop.address}
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="size-3.5 shrink-0 text-gold-dark" />
                          {shop.hours[0].label}: {shop.hours[0].value}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-2 pt-2 text-sm font-bold text-brown-950 transition-colors group-hover:text-gold-dark">
                        Esplora il negozio
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </Link>
                </FloatCard>
              </ScrollDrift>
            ))}

            <ScrollDrift index={2}>
              <FloatCard className="rounded-lg">
                <div className="relative flex h-full flex-col overflow-hidden rounded-lg bg-[#1c1512]">
                  <div className="bg-noise absolute inset-0 opacity-15" />
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=800"
                      alt="Un tavolo apparecchiato per la degustazione"
                      fill
                      className="object-cover opacity-70"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1c1512] to-transparent" />
                  </div>
                  <div className="relative flex flex-1 flex-col space-y-4 p-6">
                    <span className="eyebrow block">Ospitalità</span>
                    <h3 className="font-display text-3xl text-cream">Prenota una degustazione</h3>
                    <p className="flex-1 text-sm leading-relaxed text-cream/50">
                      Taglieri, specialità calde e i consigli del nostro banco. Ti ricontattiamo
                      noi per confermare.
                    </p>
                    <PillButton href="/prenotazioni" tone="cream" className="w-full">
                      Prenota un tavolo
                    </PillButton>
                  </div>
                </div>
              </FloatCard>
            </ScrollDrift>
          </div>
        </div>
      </section>

      {/* News — 3-column editorial grid */}
      <section className="bg-cream px-6 py-24 sm:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-16 flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div className="space-y-5">
              <span className="eyebrow eyebrow-dark block">Dal nostro blog</span>
              <h2 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl md:text-7xl">
                Storie e novità
              </h2>
            </div>
            <Link
              href="/blog"
              className="group flex items-center gap-4 text-[11px] font-bold tracking-[0.3em] text-brown-950 uppercase transition-colors hover:text-gold-dark"
            >
              Tutte le news
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-2" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
            {blogPosts.map((post, i) => (
              <ScrollDrift key={post.slug} index={i}>
                <BlogCard post={post} />
              </ScrollDrift>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="relative overflow-hidden bg-[#1c1512] px-6 py-24 sm:px-12">
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
