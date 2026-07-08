import Link from "next/link";
import Hero from "@/components/Hero";
import ScrollIntroSequence from "@/components/ScrollIntroSequence";
import SectionHeading from "@/components/SectionHeading";
import ShopCard from "@/components/ShopCard";
import ProductCard from "@/components/ProductCard";
import BlogCard from "@/components/BlogCard";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { shops, featuredProducts, blogPosts } from "@/lib/data";

export default function Home() {
  return (
    <>
      <ScrollIntroSequence />

      <Hero
        eyebrow="Norcineria di famiglia · Ancona dal 1946"
        title="La tradizione norcina nel cuore delle Marche"
        description="Formaggi stagionati, salumi artigianali, carni selezionate e la nostra porchetta: due negozi ad Ancona, la stessa cura di famiglia da tre generazioni."
        imageLabel="Foto vetrina storica negozio Centro"
        image="/images/home-hero-gastronomia.jpg"
        primaryCta={{ href: "/negozi", label: "Scopri i nostri negozi" }}
        secondaryCta={{ href: "/prenotazioni", label: "Prenota un tavolo" }}
        showMedallion
      />

      {/* I nostri negozi */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <Reveal>
          <SectionHeading
            eyebrow="Due negozi, una famiglia"
            title="I nostri negozi ad Ancona"
            description="Ogni negozio ha la sua specialità. Scegli quello più vicino a te per scoprire orari, indirizzo e prodotti."
          />
        </Reveal>
        <RevealStagger className="mt-10 grid gap-6 sm:grid-cols-2">
          {shops.map((shop) => (
            <RevealStaggerItem key={shop.slug}>
              <ShopCard shop={shop} />
            </RevealStaggerItem>
          ))}
        </RevealStagger>
      </section>

      {/* Porchetta */}
      <section className="bg-brown-900">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center">
          <Reveal y={0} delay={0.05} className="lg:order-2">
            <ImagePlaceholder label="Foto porchetta calda appena tagliata" ratio="wide" className="border-cream/10" />
          </Reveal>
          <Reveal className="lg:order-1">
            <SectionHeading
              eyebrow="La specialità della casa"
              title="La nostra porchetta"
              description="Cotta lentamente secondo la ricetta di famiglia, con la pelle croccante e le erbe delle Marche. È il prodotto che ci rappresenta di più — e che i nostri clienti aspettano ogni sabato."
              light
            />
            <Link
              href="/porchetta"
              data-magnetic
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-brown-950 transition-colors hover:bg-cream"
            >
              Scopri la porchetta
              <span aria-hidden>→</span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Prodotti migliori */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Reveal>
            <SectionHeading
              eyebrow="I preferiti dai nostri clienti"
              title="I prodotti migliori"
              description="Un assaggio della nostra selezione. L'acquisto online arriverà presto: per ora vi aspettiamo in negozio."
            />
          </Reveal>
        </div>
        <RevealStagger className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featuredProducts.map((product) => (
            <RevealStaggerItem key={product.slug}>
              <ProductCard product={product} />
            </RevealStaggerItem>
          ))}
        </RevealStagger>
      </section>

      {/* Blog preview */}
      <section className="bg-cream-dark/60 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Reveal>
              <SectionHeading eyebrow="Novità" title="Dal nostro blog" />
            </Reveal>
            <Link href="/blog" className="text-sm font-semibold text-brown-900 hover:text-gold-dark">
              Vedi tutte le news →
            </Link>
          </div>
          <RevealStagger className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {blogPosts.map((post) => (
              <RevealStaggerItem key={post.slug}>
                <BlogCard post={post} />
              </RevealStaggerItem>
            ))}
          </RevealStagger>
        </div>
      </section>

      {/* CTA prenotazioni + area personale */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <RevealStagger className="grid gap-6 sm:grid-cols-2">
          <RevealStaggerItem className="rounded-2xl border border-brown-700/15 bg-white/50 p-8">
            <h3 className="font-display text-2xl font-semibold text-brown-900">Prenota un tavolo</h3>
            <p className="mt-2 text-sm leading-relaxed text-brown-800/70">
              Vieni a trovarci per un assaggio dei nostri prodotti. Prenota il tuo posto in pochi click.
            </p>
            <Link
              href="/prenotazioni"
              data-magnetic
              className="mt-5 inline-flex rounded-full bg-brown-900 px-5 py-2.5 text-sm font-semibold text-cream hover:bg-brown-800"
            >
              Prenota ora
            </Link>
          </RevealStaggerItem>
          <RevealStaggerItem className="rounded-2xl border border-brown-700/15 bg-white/50 p-8">
            <h3 className="font-display text-2xl font-semibold text-brown-900">Scheda fedeltà</h3>
            <p className="mt-2 text-sm leading-relaxed text-brown-800/70">
              Accedi alla tua area personale per consultare i tuoi punti fedeltà e i vantaggi riservati.
            </p>
            <Link
              href="/account"
              data-magnetic
              className="mt-5 inline-flex rounded-full border border-brown-800 px-5 py-2.5 text-sm font-semibold text-brown-900 hover:bg-brown-900 hover:text-cream"
            >
              Vai all&apos;area personale
            </Link>
          </RevealStaggerItem>
        </RevealStagger>
      </section>
    </>
  );
}
