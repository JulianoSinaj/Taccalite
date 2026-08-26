import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import PageHero from "@/components/site/PageHero";
import ProductTile from "@/components/site/ProductTile";
import { getProductCategoryBySlug, getPurchasableProducts, getSetting } from "@/lib/db/queries";
import { categoryAccent } from "@/lib/categories";
import { breadcrumbSchema } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const category = await getProductCategoryBySlug(slug);
  if (!category) return {};
  return {
    title: category.seoTitle || category.name,
    description:
      category.seoDescription ||
      category.description ||
      `${category.name} — le specialità della Norcineria Taccalite, con ritiro in bottega o spedizione.`,
  };
}

/**
 * A category as a page of its own.
 *
 * Before the taxonomy existed a category was reachable only as `?cat=Salumi`, a
 * query parameter on the shop — nothing a customer could be sent, nothing Google
 * would treat as a page, and nowhere for the shop to say anything about the
 * category itself. This is that page: the shop's own words, its own colour, and
 * a stable URL.
 */
export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const category = await getProductCategoryBySlug(slug);
  if (!category) notFound();

  const [all, storeEnabled] = await Promise.all([
    getPurchasableProducts(),
    getSetting<boolean>("store.enabled", true),
  ]);
  const products = all
    .filter((p) => p.categoryId === category.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "it"));

  const accent = categoryAccent(category.name, category.accent);

  return (
    <div style={{ "--acc": accent } as React.CSSProperties}>
      <JsonLd
        schema={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Shop", path: "/negozio" },
            { name: category.name, path: `/negozio/categoria/${category.slug}` },
          ]),
        ]}
      />

      <PageHero
        eyebrow="Il banco"
        title={[
          <span key="1" className="wonk text-[var(--acc)]">
            {category.name}
          </span>,
        ]}
        lede={
          category.description ||
          `Le nostre specialità della categoria ${category.name.toLowerCase()}, pronte per il ritiro in bottega o la spedizione.`
        }
      />

      <section className="px-5 pb-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <Link
            href="/negozio"
            className="tap mb-10 inline-flex items-center gap-2 text-sm font-semibold text-brown-700 transition-colors hover:text-brown-950"
          >
            <ArrowLeft className="size-4" />
            Tutto il negozio
          </Link>

          {!storeEnabled && (
            <p className="mb-8 border border-rule bg-paper-warm px-6 py-4 text-sm text-brown-700">
              L&apos;acquisto online è momentaneamente sospeso. Trovi tutto in bottega.
            </p>
          )}

          {products.length === 0 ? (
            <div className="border border-rule bg-paper-warm p-8 text-center sm:p-12">
              <h2 className="font-display display-md text-brown-950">Nulla al banco, per ora</h2>
              <p className="mt-3 text-brown-700">
                Questa categoria non ha prodotti disponibili online in questo momento.{" "}
                <Link href="/negozio" className="font-semibold text-gold-deep underline">
                  Vedi tutto il negozio
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-10 sm:gap-x-7 sm:gap-y-14 lg:grid-cols-4">
              {products.map((p) => (
                <ProductTile
                  key={p.id}
                  product={{
                    slug: p.slug,
                    name: p.name,
                    category: p.category,
                    image: p.image,
                    imageLabel: p.imageLabel,
                    priceCents: p.priceCents,
                    unit: p.unit,
                    stock: p.stock,
                    purchasable: p.purchasable,
                    origin: p.origin,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
