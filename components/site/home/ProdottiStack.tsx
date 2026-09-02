"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductTile, { type ProductTileData } from "@/components/site/ProductTile";
import { useReducedMotionAfterMount } from "@/lib/use-reduced-motion-after-mount";

/** How many cards remain visible fanned behind each side of the front card. */
const FAN_DEPTH = 3;

const SPRING = { type: "spring", stiffness: 220, damping: 28, mass: 0.9 } as const;

/**
 * Mobile-only stacked deck for the homepage products.
 *
 * The front card sits upright; the rest fan out behind it, rotated about
 * their bottom edge like a hand of playing cards. Swiping the front card or
 * tapping the arrows walks the deck. The deck's height comes from an
 * invisible in-flow copy of the active tile, so the section never guesses at
 * a fixed height while every visible card is absolutely positioned.
 */
export default function ProdottiStack({
  products,
  className = "",
}: {
  products: ProductTileData[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const reduceMotion = useReducedMotionAfterMount();

  if (products.length === 0) return null;

  const prev = () => setActive((i) => Math.max(0, i - 1));
  const next = () => setActive((i) => Math.min(products.length - 1, i + 1));

  return (
    <div className={className} role="region" aria-roledescription="carousel" aria-label="I prodotti migliori">
      {/* Overflow stays visible so the fanned edges can breathe past the card,
          but the page gutter is re-added inside so nothing clips at the edge. */}
      <div className="relative" style={{ perspective: "1200px" }}>
        {/* Invisible spacer: the active product rendered in normal flow, purely
            to give the absolute stack its height. */}
        <div aria-hidden className="pointer-events-none invisible mx-auto w-[64vw] max-w-[16rem]">
          <ProductTile product={products[active]} morph={false} />
        </div>

        {products.map((product, i) => {
          const d = i - active;
          const abs = Math.abs(d);
          const hidden = abs > FAN_DEPTH;
          const isActive = d === 0;

          return (
            <motion.div
              key={product.slug}
              // Back cards fan as bare photo cards, like a hand of playing
              // cards: their text block fades out so rotated names and prices
              // never scribble over the front card's own caption.
              className={`absolute inset-x-0 top-0 mx-auto w-[64vw] max-w-[16rem] will-change-transform [&>article>div:nth-child(2)]:transition-opacity [&>article>div:nth-child(2)]:duration-500 ${
                isActive ? "" : "[&>article>div:nth-child(2)]:opacity-0"
              }`}
              style={{
                zIndex: 20 - abs,
                transformOrigin: "50% 100%",
                pointerEvents: isActive ? "auto" : "none",
              }}
              initial={false}
              animate={{
                x: d * 54,
                // Back cards tuck upward as they recede, so their bottom
                // corners never swing down over the front card's caption.
                y: Math.min(abs, FAN_DEPTH) * -14,
                rotate: d * 7,
                scale: 1 - Math.min(abs, FAN_DEPTH) * 0.08,
                opacity: hidden ? 0 : 1,
                filter: `brightness(${1 - Math.min(abs, FAN_DEPTH) * 0.14})`,
              }}
              transition={reduceMotion ? { duration: 0 } : SPRING}
              drag={isActive && !reduceMotion ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={(_, info) => {
                if (info.offset.x < -56) next();
                else if (info.offset.x > 56) prev();
              }}
              aria-hidden={!isActive}
            >
              <ProductTile product={product} morph={false} />
            </motion.div>
          );
        })}
      </div>

      {/* Arrows flanking the dots, as in the deck illustration. */}
      <div className="mt-7 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={prev}
          disabled={active === 0}
          aria-label="Prodotto precedente"
          className="tap flex size-9 items-center justify-center rounded-full border border-rule text-brown-950 transition-colors duration-300 hover:border-gold hover:text-gold-deep disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>

        <div className="flex items-center gap-2" aria-hidden>
          {products.map((p, i) => (
            <span
              key={p.slug}
              className={`rounded-full transition-all duration-300 ${
                i === active ? "size-2 bg-gold-deep" : "size-[5px] bg-brown-950/25"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={next}
          disabled={active === products.length - 1}
          aria-label="Prodotto successivo"
          className="tap flex size-9 items-center justify-center rounded-full border border-rule text-brown-950 transition-colors duration-300 hover:border-gold hover:text-gold-deep disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {products[active].name}, {active + 1} di {products.length}
      </p>
    </div>
  );
}
