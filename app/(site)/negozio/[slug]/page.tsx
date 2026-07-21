import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Store } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import AddToCartButton from "@/components/store/AddToCartButton";
import { getProductBySlug, getRelatedProducts, getShopBySlug } from "@/lib/db/queries";
import { formatEuro } from "@/lib/format";
import { absoluteUrl, siteConfig } from "@/lib/site";
import { breadcrumbSchema } from "@/lib/seo";

export const dynamic = "force-dynamic";

const LOW_STOCK_THRESHOLD = 5;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || !product.active || !product.purchasable) return {};
  return {
    title: product.name,
    description:
      product.description ||
      `${product.name} — acquista online dalla Norcineria Taccalite con ritiro in bottega o spedizione.`,
  };
}

export default async function ProductDetailPage({ params }: Params) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || !product.active || !product.purchasable) notFound();

  const [shop, related] = await Promise.all([
    getShopBySlug(product.shopSlug),
    getRelatedProducts({ slug: product.slug, category: product.category, shopSlug: product.shopSlug }, 4),
  ]);

  const soldOut = product.stock === 0;
  const lowStock = product.stock != null && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    category: product.category,
    image: absoluteUrl(product.image),
    brand: { "@type": "Brand", name: siteConfig.name },
    offers: {
      "@type": "Offer",
      price: ((product.priceCents ?? 0) / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: soldOut
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      url: absoluteUrl(`/negozio/${product.slug}`),
    },
  };

  return (
    <div>
      <JsonLd
        schema={[
          productLd,
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "E-Shop", path: "/negozio" },
            { name: product.name, path: `/negozio/${product.slug}` },
          ]),
        ]}
      />

      <section className="bg-cream px-5 pt-32 pb-24 sm:px-10 sm:pt-40">
        <div className="mx-auto max-w-7xl">
          <nav className="mb-8 text-[10px] font-bold tracking-[0.3em] text-brown-900/50 uppercase">
            <Link href="/negozio" className="inline-flex items-center gap-1.5 hover:text-gold-deep">
              <ArrowLeft className="size-3" />
              Torna al negozio
            </Link>
          </nav>

          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Image */}
            <div className="relative aspect-square overflow-hidden rounded-[32px] border border-brown-900/10 bg-cream-dark">
              {product.image ? (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  preload
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-bold tracking-widest text-brown-800/40 uppercase">
                  {product.imageLabel || product.name}
                </div>
              )}
              {soldOut && (
                <span className="absolute left-5 top-5 rounded-full bg-brown-950 px-4 py-2 text-[11px] font-bold tracking-widest text-cream uppercase">
                  Esaurito
                </span>
              )}
              {lowStock && (
                <span className="absolute left-5 top-5 rounded-full bg-gold px-4 py-2 text-[11px] font-bold tracking-widest text-brown-950 uppercase">
                  Ultimi {product.stock}
                </span>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col">
              {product.category && (
                <p className="text-[11px] font-bold tracking-widest text-gold-deep uppercase">
                  {product.category}
                </p>
              )}
              <h1 className="font-display mt-2 text-4xl leading-none tracking-tighter text-brown-950 sm:text-5xl">
                {product.name}
              </h1>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-bold text-brown-950">
                  {formatEuro(product.priceCents ?? 0)}
                </span>
                {product.unit && <span className="text-base text-brown-800/60">/ {product.unit}</span>}
              </div>

              {/* Availability */}
              <div className="mt-4">
                {soldOut ? (
                  <span className="inline-flex rounded-full bg-red-500/10 px-4 py-1.5 text-xs font-semibold text-red-700">
                    Non disponibile al momento
                  </span>
                ) : lowStock ? (
                  <span className="inline-flex rounded-full bg-gold/20 px-4 py-1.5 text-xs font-semibold text-brown-950">
                    Ultimi {product.stock} disponibili
                  </span>
                ) : product.stock != null ? (
                  <span className="inline-flex rounded-full bg-brown-900/5 px-4 py-1.5 text-xs font-semibold text-brown-900/70">
                    Disponibile
                  </span>
                ) : null}
              </div>

              {product.description && (
                <p className="mt-6 text-lg leading-relaxed font-light text-brown-900/75">
                  {product.description}
                </p>
              )}

              {shop && (
                <Link
                  href={`/negozi/${shop.slug}`}
                  className="mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-brown-900/15 px-5 py-2.5 text-sm font-semibold text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream"
                >
                  <Store className="size-4 text-gold-deep" />
                  Da {shop.name}
                  <ArrowRight className="size-3.5" />
                </Link>
              )}

              <div className="mt-8 max-w-xs">
                <AddToCartButton
                  product={{
                    slug: product.slug,
                    name: product.name,
                    priceCents: product.priceCents ?? 0,
                    unit: product.unit,
                    image: product.image,
                  }}
                  stock={product.stock}
                  withQuantity
                />
              </div>
            </div>
          </div>

          {/* Related products */}
          {related.length > 0 && (
            <div className="mt-24">
              <h2 className="font-display mb-10 text-3xl tracking-tighter text-brown-950 sm:text-4xl">
                Potrebbe interessarti
              </h2>
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/negozio/${r.slug}`}
                    className="group flex flex-col overflow-hidden rounded-[20px] border border-brown-900/10 bg-white/60"
                  >
                    <div className="relative aspect-square overflow-hidden bg-cream-dark">
                      {r.image ? (
                        <Image
                          src={r.image}
                          alt={r.name}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 1024px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-[10px] font-bold tracking-widest text-brown-800/40 uppercase">
                          {r.imageLabel || r.name}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-[9px] font-bold tracking-widest text-gold-deep uppercase">{r.category}</p>
                      <h3 className="font-display mt-1 text-lg leading-tight text-brown-950 group-hover:text-gold-deep">
                        {r.name}
                      </h3>
                      <p className="mt-2 font-display font-bold text-brown-950">
                        {formatEuro(r.priceCents ?? 0)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
