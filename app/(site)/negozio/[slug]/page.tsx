import { ViewTransition } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Store } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import ProductBuy from "@/components/store/ProductBuy";
import BackInStockForm from "@/components/store/BackInStockForm";
import {
  getProductBySlug,
  getRelatedProducts,
  getShopBySlug,
  getProductCategoryById,
} from "@/lib/db/queries";
import { formatEuro } from "@/lib/format";
import ProductPlate from "@/components/site/ProductPlate";
import { categoryAccent } from "@/lib/categories";
import ProductTile from "@/components/site/ProductTile";
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

  const [shop, related, categoryRow] = await Promise.all([
    getShopBySlug(product.shopSlug),
    getRelatedProducts({ slug: product.slug, category: product.category, shopSlug: product.shopSlug }, 4),
    product.categoryId ? getProductCategoryById(product.categoryId) : null,
  ]);
  const categorySlug = categoryRow?.active ? categoryRow.slug : null;

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

      {/* `pb-28` on a phone clears the sticky buy bar, which would otherwise sit
          over the last row of the related-products grid. */}
      <section className="bg-paper px-5 pt-28 pb-28 sm:px-8 sm:pt-40 lg:px-12 lg:pb-24">
        <div
          className="mx-auto max-w-[88rem]"
          style={{ "--acc": categoryAccent(product.category) } as React.CSSProperties}
        >
          <nav className="mb-5 text-[11px] font-bold tracking-[0.3em] text-taupe uppercase sm:mb-8">
            <Link
              href="/negozio"
              className="inline-flex items-center gap-1.5 py-2 transition-colors hover:text-gold-deep"
            >
              <ArrowLeft className="size-3" />
              Torna al negozio
            </Link>
          </nav>

          <div className="grid grid-cols-1 gap-9 lg:grid-cols-2 lg:gap-16">
            {/* Image. The ViewTransition name matches the one on this product's
                tile in any grid, so arriving here morphs the thumbnail into the
                hero rather than swapping one page for another.
                Landscape on a phone, square above it, and bled to both edges:
                a full-width square is 375px of an 812px screen, and it was
                pushing the name, the price and the buy button past the fold
                between them. The 4:3 crop gives back a hundred pixels and the
                bleed gives back the gutters — the picture ends up *larger* than
                the inset square it replaces while taking less of the screen. */}
            <div className="relative -mx-5 aspect-4/3 overflow-hidden border-y border-brown-950/8 bg-paper-deep sm:mx-0 sm:aspect-square sm:border">
              <ViewTransition name={`product-${product.slug}`} share="product-morph">
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
                  // The same printed plate the grid uses, so the tile the visitor
                  // clicked and the page they land on are the same object. The
                  // old fallback here was a pale letter in a beige square — on the
                  // one page that has to close a sale.
                  <ProductPlate
                    name={product.name}
                    category={product.category}
                    seed={product.slug}
                  />
                )}
              </ViewTransition>
              {soldOut && (
                <span className="absolute top-5 left-5 z-10 bg-brown-950 px-4 py-2 text-[0.625rem] font-bold tracking-[0.18em] text-cream uppercase">
                  Esaurito
                </span>
              )}
              {lowStock && (
                <span className="absolute top-5 left-5 z-10 bg-gold px-4 py-2 text-[0.625rem] font-bold tracking-[0.18em] text-on-gold uppercase">
                  Ultimi {product.stock}
                </span>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col">
              {product.category && (
                // Links to the category's own page when it has one. This is what
                // gives that page inbound links from every product in it —
                // without them it would be reachable only from the shop's filter
                // rail, which is not a link a customer or a crawler follows.
                <p className="flex items-center gap-2.5 text-[0.625rem] font-bold tracking-[0.22em] text-[var(--acc)] uppercase">
                  <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
                  {categorySlug ? (
                    <Link href={`/negozio/categoria/${categorySlug}`} className="hover:underline">
                      {product.category}
                    </Link>
                  ) : (
                    product.category
                  )}
                </p>
              )}
              <h1 className="font-display display-lg mt-4 font-semibold text-brown-950">
                {product.name}
              </h1>

              <div className="ticket mt-7 inline-flex w-fit items-baseline gap-1.5 bg-[color-mix(in_oklab,var(--acc)_11%,var(--paper-warm))] px-4 py-2.5">
                <span className="font-display text-3xl font-semibold text-brown-950 tabular-nums">
                  {formatEuro(product.priceCents ?? 0)}
                </span>
                {product.unit && <span className="text-base text-taupe">/ {product.unit}</span>}
              </div>

              {/* Availability */}
              <div className="mt-4">
                {soldOut ? (
                  <span className="inline-flex bg-danger-soft px-4 py-1.5 text-xs font-semibold text-danger-soft-fg">
                    Non disponibile al momento
                  </span>
                ) : lowStock ? (
                  <span className="inline-flex bg-gold/25 px-4 py-1.5 text-xs font-semibold text-brown-950">
                    Ultimi {product.stock} disponibili
                  </span>
                ) : product.stock != null ? (
                  <span className="inline-flex bg-paper-warm px-4 py-1.5 text-xs font-semibold text-brown-700">
                    Disponibile
                  </span>
                ) : null}
              </div>

              {product.description && (
                <p className="mt-7 text-lg leading-relaxed text-brown-700">
                  {product.description}
                </p>
              )}

              {shop && (
                <Link
                  href={`/sedi/${shop.slug}`}
                  className="mt-7 inline-flex w-fit items-center gap-2 border border-rule-strong px-5 py-2.5 text-sm font-semibold text-brown-950 transition-colors hover:bg-brown-950 hover:text-cream"
                >
                  <Store className="size-4 text-gold-deep" />
                  Da {shop.name}
                  <ArrowRight className="size-3.5" />
                </Link>
              )}

              {/* Renders the buy block *and* the bar that replaces it once it
                  scrolls off a phone screen — one control, one component. */}
              <ProductBuy
                product={{
                  slug: product.slug,
                  name: product.name,
                  priceCents: product.priceCents ?? 0,
                  unit: product.unit,
                  image: product.image,
                }}
                stock={product.stock}
              >
                {soldOut && <BackInStockForm slug={product.slug} />}
              </ProductBuy>
            </div>
          </div>

          {/* Related products */}
          {related.length > 0 && (
            <div className="mt-16 sm:mt-24">
              <h2 className="font-display display-md mb-7 font-semibold text-brown-950 sm:mb-10">
                Potrebbe interessarti
              </h2>
              <div className="grid grid-cols-2 gap-x-3.5 gap-y-10 sm:gap-x-7 sm:gap-y-12 lg:grid-cols-4">
                {related.map((r) => (
                  <ProductTile
                    key={r.id}
                    morph={false}
                    product={{
                      slug: r.slug,
                      name: r.name,
                      category: r.category,
                      image: r.image,
                      imageLabel: r.imageLabel,
                      priceCents: r.priceCents,
                      unit: r.unit,
                      stock: r.stock,
                      purchasable: r.purchasable,
                      origin: r.origin,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
