import { ViewTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import QuickAdd from "@/components/site/QuickAdd";
import ProductPlate from "@/components/site/ProductPlate";
import { categoryAccent } from "@/lib/categories";
import { formatEuro } from "@/lib/format";

export type ProductTileData = {
  slug: string;
  name: string;
  category: string;
  image: string;
  imageLabel: string;
  priceCents: number | null;
  unit: string | null;
  stock: number | null;
  purchasable: boolean;
  origin?: string | null;
};

/** Below this, say how few are left — scarcity that is true is a fair thing to show. */
const LOW_STOCK_THRESHOLD = 5;

/** Wraps the media in a named ViewTransition, or leaves it plain. */
function MaybeMorph({
  enabled,
  slug,
  children,
}: {
  enabled: boolean;
  slug: string;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <ViewTransition name={`product-${slug}`} share="product-morph">
      {children}
    </ViewTransition>
  );
}

/**
 * A product on paper.
 *
 * Half the catalogue has no photograph, so the tile is built typography-first
 * and treats the image as an upgrade rather than a requirement: with no file it
 * falls back to the initial set large in gold, which reads as a deliberate
 * printed-catalogue device instead of a hole where a picture should be.
 *
 * The media is a stack rather than a single link, because the buy button cannot
 * be nested inside the link that opens the product — that is invalid markup and
 * swallows the click. The link is a transparent hit area under the controls.
 */
export default function ProductTile({
  product,
  morph = true,
}: {
  product: ProductTileData;
  /**
   * Take part in the shared-element morph into the product page.
   *
   * On for grids the visitor navigates *from*. Off for the related-products rail
   * on a product page: those tiles share slugs with the grid you just left, so
   * leaving it on sends three or four photos flying across the screen at once
   * and the one thing you actually clicked stops reading as the subject.
   */
  morph?: boolean;
}) {
  const buyable = product.purchasable && product.priceCents != null;
  const soldOut = product.stock === 0;
  const lowStock =
    product.stock != null && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;

  return (
    <article
      className="group flex h-full flex-col"
      style={{ "--acc": categoryAccent(product.category) } as React.CSSProperties}
    >
      <div className="relative aspect-4/5 overflow-hidden bg-paper-deep transition-shadow duration-700 group-hover:shadow-[0_26px_50px_-24px_color-mix(in_oklab,var(--acc)_55%,transparent)]">
        {/* Named so it morphs into the hero of the product page instead of the
            two pages swapping with nothing to connect them. */}
        <MaybeMorph enabled={morph} slug={product.slug}>
          {product.image ? (
            <Image
              src={product.image}
              alt={product.imageLabel || product.name}
              fill
              sizes="(max-width: 640px) 70vw, (max-width: 1024px) 45vw, 24vw"
              className="object-cover transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
            />
          ) : (
            <ProductPlate
              name={product.name}
              category={product.category}
              seed={product.slug}
              className="transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
            />
          )}
        </MaybeMorph>

        <Link
          href={`/negozio/${product.slug}`}
          aria-label={product.name}
          className="absolute inset-0 z-10 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
        />

        {soldOut && (
          <span className="absolute top-4 left-4 z-20 bg-brown-950 px-3 py-1.5 text-[0.625rem] font-semibold tracking-[0.18em] text-cream uppercase">
            Esaurito
          </span>
        )}
        {lowStock && (
          <span className="absolute top-4 left-4 z-20 bg-gold px-3 py-1.5 text-[0.625rem] font-semibold tracking-[0.18em] text-on-gold uppercase">
            Ultimi {product.stock}
          </span>
        )}

        {buyable && (
          <QuickAdd
            className="absolute inset-x-4 bottom-4 z-20"
            product={{
              slug: product.slug,
              name: product.name,
              priceCents: product.priceCents as number,
              unit: product.unit,
              image: product.image,
            }}
            stock={product.stock}
          />
        )}

        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 border border-brown-950/8 transition-colors duration-500 group-hover:border-[color-mix(in_oklab,var(--acc)_55%,transparent)]"
        />
      </div>

      <div className="flex flex-1 flex-col pt-5">
        {/* The category, in the category's own colour — the one place the grid
            tells you what kind of thing you are looking at without you reading. */}
        <p className="flex items-center gap-2 text-[0.625rem] font-semibold tracking-[0.22em] text-[var(--acc)] uppercase">
          <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
          {product.category}
        </p>
        <h3 className="font-display mt-2 text-xl leading-tight font-semibold tracking-[-0.02em] text-brown-950">
          <Link
            href={`/negozio/${product.slug}`}
            className="transition-colors hover:text-gold-deep focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </h3>

        {product.origin && <p className="mt-1.5 text-[0.8125rem] text-taupe">{product.origin}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {product.priceCents != null ? (
            // Stamped on a tinted ticket rather than set as running text: on a
            // grid of two dozen tiles the price is the thing being compared, and
            // it was previously the quietest mark on the card.
            <p className="ticket bg-[color-mix(in_oklab,var(--acc)_11%,var(--paper-warm))] px-2.5 py-1 text-[0.9375rem] font-semibold text-brown-950 tabular-nums">
              {formatEuro(product.priceCents)}
              {product.unit && <span className="font-normal text-taupe"> / {product.unit}</span>}
            </p>
          ) : (
            <p className="text-[0.8125rem] text-taupe">Al banco, su richiesta</p>
          )}
          {soldOut && <span className="text-[0.8125rem] text-taupe">· esaurito</span>}
        </div>
      </div>
    </article>
  );
}
