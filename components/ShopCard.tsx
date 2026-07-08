import Link from "next/link";
import Photo from "./Photo";
import type { Shop } from "@/lib/data";

export default function ShopCard({ shop }: { shop: Shop }) {
  return (
    <Link
      href={`/negozi/${shop.slug}`}
      className="group block overflow-hidden rounded-2xl border border-brown-700/15 bg-white/50 transition-shadow hover:shadow-xl hover:shadow-brown-900/10"
    >
      <Photo
        src={shop.image}
        alt={shop.name}
        label={shop.imageLabel}
        ratio="wide"
        className="rounded-none rounded-t-2xl border-0"
      />
      <div className="p-6">
        <div className="text-xs font-semibold tracking-[0.15em] text-gold-dark uppercase">
          {shop.specialty}
        </div>
        <h3 className="font-display mt-1 text-2xl font-semibold text-brown-900">{shop.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-brown-800/70">{shop.tagline}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brown-900 group-hover:text-gold-dark">
          Scopri il negozio
          <span aria-hidden className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
