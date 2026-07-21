import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import Reveal from "@/components/Reveal";
import PillButton from "@/components/PillButton";
import { getShops } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "I Nostri Negozi",
  description:
    "Le due botteghe Taccalite ad Ancona: i grandi formaggi in Piazza Kennedy, carni e salumi al Mercato Coperto del Piano.",
};

export default async function NegoziPage() {
  const shops = await getShops();
  return (
    <div>
      {/* Hero band */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-44 pb-24 sm:px-10 sm:pt-56 sm:pb-32">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -top-52 -right-52 h-[48rem] w-[48rem] opacity-10" />
        <Reveal className="relative mx-auto flex max-w-7xl flex-col items-center gap-16 lg:flex-row lg:gap-24">
          <div className="w-full lg:w-[55%]">
            <span className="eyebrow mb-8 block">Le nostre sedi · Ancona</span>
            <h1 className="font-display max-w-4xl text-5xl leading-[0.95] tracking-tighter text-cream sm:text-7xl md:text-8xl">
              Due botteghe,
              <br />
              <span className="text-gold italic">un&apos;anima sola</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed font-light text-cream/75">
              Il banco dei grandi formaggi in Piazza Kennedy e quello delle carni al Mercato
              Coperto del Piano. Stessa famiglia, stessa cura: scegli la bottega più vicina e
              vieni ad assaggiare.
            </p>
          </div>

          {/* Single frame — la bottega in un'immagine */}
          <div className="relative hidden w-full max-w-md lg:block lg:w-[45%]">
            <div className="cinematic-shadow relative aspect-[5/4] -rotate-2 overflow-hidden rounded-[32px] will-change-transform">
              <Image
                src="/images/coppa-finocchio-bottega.jpg"
                alt="Coppa artigianale con finocchio, aglio e semi di finocchio sul banco della bottega"
                fill
                priority
                className="object-cover"
                sizes="(max-width: 1024px) 0px, 40vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-brown-950/40 via-transparent to-transparent" />
            </div>
          </div>
        </Reveal>
      </section>

      {/* Editorial shop rows */}
      <section className="bg-cream px-5 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto max-w-7xl space-y-28 sm:space-y-40">
          {shops.map((shop, i) => (
            <Reveal
              key={shop.slug}
              className={`flex flex-col items-center gap-12 lg:gap-20 ${
                i % 2 === 0 ? "lg:flex-row" : "lg:flex-row-reverse"
              }`}
            >
              <div className="relative w-full lg:w-[55%]">
                <Link
                  href={`/negozi/${shop.slug}`}
                  className="group cinematic-shadow relative block aspect-[4/3] overflow-hidden rounded-[32px]"
                >
                  <Image
                    src={shop.image}
                    alt={shop.name}
                    fill
                    className="object-cover transition-transform duration-[1.8s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                    sizes="(max-width: 1024px) 100vw, 55vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brown-950/50 via-transparent to-transparent" />
                  <span className="absolute top-6 left-6 rounded-full bg-cream/90 px-4 py-1.5 text-[10px] font-bold tracking-widest text-brown-950 uppercase backdrop-blur">
                    {shop.specialty}
                  </span>
                </Link>
              </div>

              <div className="w-full space-y-7 lg:w-[45%]">
                <p className="font-display text-6xl font-bold text-brown-950/10 sm:text-7xl">
                  0{i + 1}
                </p>
                <div className="space-y-4">
                  <span className="eyebrow eyebrow-dark block">{shop.specialty}</span>
                  <h2 className="font-display text-4xl leading-[0.95] tracking-tighter text-brown-950 sm:text-5xl md:text-6xl">
                    {shop.name}
                  </h2>
                </div>
                <p className="max-w-lg text-lg leading-relaxed font-light text-brown-900/70">
                  {shop.description}
                </p>
                <div className="space-y-3 border-t border-brown-900/10 pt-6 text-sm font-semibold text-brown-800/85">
                  <p className="flex items-center gap-3">
                    <MapPin className="size-4 shrink-0 text-gold-deep" />
                    {shop.address}
                  </p>
                  {shop.hours[0] && (
                    <p className="flex items-center gap-3">
                      <Clock className="size-4 shrink-0 text-gold-deep" />
                      {shop.hours[0].label}: {shop.hours[0].value}
                    </p>
                  )}
                  <p className="flex items-center gap-3">
                    <Phone className="size-4 shrink-0 text-gold-deep" />
                    {shop.phone}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 pt-2">
                  <Link
                    href={`/negozi/${shop.slug}`}
                    data-magnetic
                    className="inline-flex items-center gap-3 rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-cream transition-all duration-500 hover:-translate-y-0.5 hover:bg-brown-900"
                  >
                    Esplora la bottega
                    <ArrowRight className="size-4" />
                  </Link>
                  <a
                    href={`tel:${shop.phone.replace(/\s/g, "")}`}
                    className="underline-draw inline-flex items-center py-3.5 text-sm font-semibold text-brown-950"
                  >
                    Chiama il banco
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Prenotazioni funnel */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 py-24 sm:px-10 sm:py-32">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -bottom-52 -left-40 h-[44rem] w-[44rem] opacity-10" />
        <Reveal className="relative mx-auto flex max-w-7xl flex-col items-center gap-10 text-center">
          <span className="eyebrow block">Ospitalità Taccalite</span>
          <h2 className="font-display max-w-3xl text-4xl leading-[0.95] tracking-tighter text-cream sm:text-6xl">
            Siediti al banco:
            <span className="text-gold italic"> ti apparecchiamo noi.</span>
          </h2>
          <p className="max-w-xl text-lg leading-relaxed font-light text-cream/75">
            Taglieri di salumi e formaggi, porchetta calda e i consigli di chi la prepara da tre
            generazioni. Prenota il tuo tavolo: ti richiamiamo noi per confermare.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <PillButton href="/prenotazioni" tone="gold">
              Prenota un tavolo
            </PillButton>
            <PillButton href="/porchetta" tone="ghost">
              Scopri la porchetta
            </PillButton>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
