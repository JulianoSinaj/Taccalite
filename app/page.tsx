import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Award, Flame, MapPin } from "lucide-react";
import SplitHero from "@/components/SplitHero";
import StickyBuyBar from "@/components/StickyBuyBar";
import ScrollFilm from "@/components/ScrollFilm";
import SaturdayCountdown from "@/components/SaturdayCountdown";
import PillButton from "@/components/PillButton";
import FloatCard from "@/components/FloatCard";
import ScrollDrift from "@/components/ScrollDrift";
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Home() {
  const latestPost = blogPosts[0];

  return (
    <>
      <SplitHero />
      <StickyBuyBar />

      {/* Atto II — il processo, scrubbed dallo scroll */}
      <ScrollFilm />

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
              className="group flex items-center gap-4 text-[11px] font-bold tracking-[0.3em] text-brown-950 uppercase transition-colors hover:text-gold-deep"
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
                      <p className="text-[10px] font-bold tracking-widest text-gold-deep uppercase">
                        {product.category}
                      </p>
                      <h3 className="font-display text-2xl text-brown-950">{product.name}</h3>
                      <span className="inline-flex items-center gap-2 pt-2 text-sm font-bold text-gold-deep transition-all group-hover:gap-4">
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
      <section className="bg-cream-dark px-6 py-24 sm:px-12">
        <div className="mx-auto max-w-7xl">
          <h2 className="font-display mb-16 max-w-3xl text-5xl leading-[0.95] tracking-tighter text-brown-950 sm:text-6xl md:text-7xl">
            Il mondo Taccalite,
            <span className="text-gold-deep italic"> in un colpo d&apos;occhio</span>
          </h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-6">
            {/* Countdown — the hero tile */}
            <div className="relative overflow-hidden rounded-[28px] bg-[#1c1512] md:col-span-4 md:row-span-2">
              <Image
                src="https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&q=80&w=1400"
                alt="La porchetta del sabato"
                fill
                className="object-cover opacity-25"
                sizes="(max-width: 768px) 100vw, 66vw"
              />
              <div className="bg-noise absolute inset-0 opacity-15" />
              <div className="relative flex h-full flex-col justify-between gap-10 p-8 sm:p-12">
                <div className="space-y-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold">
                    <Flame className="size-6" />
                  </span>
                  <h3 className="font-display max-w-md text-3xl leading-tight text-cream sm:text-4xl">
                    La prossima porchetta esce dal forno tra
                  </h3>
                </div>
                <SaturdayCountdown />
                <div className="flex flex-wrap items-center gap-5">
                  <PillButton href="/prenotazioni" tone="gold">
                    Riserva la tua porzione
                  </PillButton>
                  <p className="text-[10px] font-bold tracking-[0.25em] text-cream/65 uppercase">
                    Sabato · Piazza Kennedy · fino a esaurimento
                  </p>
                </div>
              </div>
            </div>

            {/* Le botteghe */}
            <Link
              href="/negozi"
              className="group relative flex flex-col justify-between gap-8 overflow-hidden rounded-[28px] border border-brown-900/10 bg-white/60 p-8 transition-all duration-500 hover:border-brown-900/25 md:col-span-2"
            >
              <div className="space-y-5">
                <h3 className="font-display text-2xl text-brown-950">Le due botteghe</h3>
                {shops.map((shop) => (
                  <div key={shop.slug} className="border-t border-brown-900/10 pt-4">
                    <p className="text-sm font-bold text-brown-950">{shop.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs font-semibold text-brown-800/80">
                      <MapPin className="size-3.5 shrink-0 text-gold-deep" />
                      {shop.address}
                    </p>
                  </div>
                ))}
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-bold text-gold-deep transition-all group-hover:gap-4">
                Trova la più vicina
                <ArrowRight className="size-4" />
              </span>
            </Link>

            {/* Club */}
            <Link
              href="/account"
              className="group relative flex flex-col justify-between gap-8 overflow-hidden rounded-[28px] bg-brown-950 p-8 md:col-span-2"
            >
              <div className="bg-noise absolute inset-0 opacity-15" />
              <div className="relative space-y-3">
                <Award className="size-7 text-gold" />
                <h3 className="font-display text-2xl text-cream">Club Taccalite</h3>
                <p className="text-sm leading-relaxed font-light text-cream/75">
                  Punti a ogni acquisto, premi dal banco: taglieri, Verdicchio e porchetta.
                </p>
              </div>
              <span className="relative inline-flex items-center gap-2 text-sm font-bold text-gold transition-all group-hover:gap-4">
                Entra nel club
                <ArrowRight className="size-4" />
              </span>
            </Link>

            {/* 1946 — drenched gold moment */}
            <div className="flex flex-col justify-between gap-8 rounded-[28px] bg-gold p-8 md:col-span-2">
              <p className="font-display text-6xl font-bold tracking-tighter text-brown-950 sm:text-7xl">
                1946
              </p>
              <p className="text-sm leading-relaxed font-semibold text-brown-950/85">
                Tre generazioni, una sola ricetta. La bottega di famiglia nel cuore di Ancona,
                da ottant&apos;anni.
              </p>
            </div>

            {/* Ultima news */}
            {latestPost && (
              <Link
                href={`/blog/${latestPost.slug}`}
                className="group relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-[28px] md:col-span-4"
              >
                {latestPost.image && (
                  <Image
                    src={latestPost.image}
                    alt={latestPost.title}
                    fill
                    className="object-cover transition-transform duration-[1.8s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 66vw"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-brown-950/90 via-brown-950/35 to-transparent" />
                <div className="relative space-y-2 p-8">
                  <p className="text-[10px] font-bold tracking-[0.25em] text-gold uppercase">
                    Dal diario · {formatDate(latestPost.date)}
                  </p>
                  <h3 className="font-display max-w-xl text-2xl leading-tight text-cream sm:text-3xl">
                    {latestPost.title}
                  </h3>
                  <span className="inline-flex items-center gap-2 pt-1 text-sm font-bold text-cream transition-all group-hover:gap-4">
                    Leggi la storia
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Atto IV — chiusura */}
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
