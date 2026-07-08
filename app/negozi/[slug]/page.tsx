import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Photo from "@/components/Photo";
import SectionHeading from "@/components/SectionHeading";
import ProductCard from "@/components/ProductCard";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { shops, featuredProducts } from "@/lib/data";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return shops.map((shop) => ({ slug: shop.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) return {};
  return {
    title: `${shop.name} — Norcineria Taccalite`,
    description: shop.tagline,
  };
}

export default async function ShopDetailPage({ params }: Params) {
  const { slug } = await params;
  const shop = shops.find((s) => s.slug === slug);
  if (!shop) notFound();

  const otherShop = shops.find((s) => s.slug !== slug);
  const shopProducts = featuredProducts.filter((p) => p.shopSlug === slug);

  return (
    <div>
      <section className="bg-brown-950">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center">
          <div>
            <Link href="/negozi" className="text-sm font-medium text-cream/60 hover:text-cream">
              ← Tutti i negozi
            </Link>
            <div className="mt-4 text-xs font-semibold tracking-[0.2em] text-gold uppercase">
              {shop.specialty}
            </div>
            <h1 className="font-display mt-2 text-4xl font-semibold text-cream sm:text-5xl">
              {shop.name}
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-cream/70">{shop.tagline}</p>
          </div>
          <Photo src={shop.image} alt={shop.name} label={shop.imageLabel} ratio="wide" className="border-cream/10" priority />
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-3">
        <Reveal className="lg:col-span-2">
          <SectionHeading title="Chi siamo" />
          <p className="mt-4 leading-relaxed text-brown-800/80">{shop.description}</p>
          <ul className="mt-6 space-y-3">
            {shop.highlights.map((h) => (
              <li key={h} className="flex items-start gap-3 text-brown-800/80">
                <span className="mt-1 text-gold-dark" aria-hidden>
                  ●
                </span>
                {h}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="rounded-2xl border border-brown-700/15 bg-white/50 p-6 h-fit">
          <h3 className="font-display text-lg font-semibold text-brown-900">Informazioni</h3>
          <div className="mt-4 space-y-4 text-sm text-brown-800/80">
            <div>
              <div className="font-semibold text-brown-900">Indirizzo</div>
              <p>{shop.address}</p>
              {!shop.addressConfirmed && (
                <p className="mt-1 text-xs text-taupe">
                  Indirizzo segnaposto — da confermare prima della pubblicazione.
                </p>
              )}
            </div>
            <div>
              <div className="font-semibold text-brown-900">Orari</div>
              <ul>
                {shop.hours.map((h) => (
                  <li key={h.label}>
                    {h.label}: {h.value}
                  </li>
                ))}
              </ul>
              {!shop.hoursConfirmed && (
                <p className="mt-1 text-xs text-taupe">Orari da confermare prima della pubblicazione.</p>
              )}
            </div>
            <div>
              <div className="font-semibold text-brown-900">Telefono</div>
              <p>{shop.phone}</p>
            </div>
          </div>
          <Link
            href="/prenotazioni"
            data-magnetic
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-brown-900 px-5 py-2.5 text-sm font-semibold text-cream hover:bg-brown-800"
          >
            Prenota un tavolo
          </Link>
        </Reveal>
      </section>

      {shopProducts.length > 0 && (
        <section className="bg-cream-dark/60 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <Reveal>
              <SectionHeading eyebrow="Da questo negozio" title="Prodotti in evidenza" />
            </Reveal>
            <RevealStagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shopProducts.map((product) => (
                <RevealStaggerItem key={product.slug}>
                  <ProductCard product={product} />
                </RevealStaggerItem>
              ))}
            </RevealStagger>
          </div>
        </section>
      )}

      {otherShop && (
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-sm text-brown-800/70">
            Cerchi {otherShop.specialty.toLowerCase()}?{" "}
            <Link href={`/negozi/${otherShop.slug}`} className="font-semibold text-brown-900 hover:text-gold-dark">
              Scopri {otherShop.name} →
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
