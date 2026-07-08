import ImagePlaceholder from "./ImagePlaceholder";
import type { Product } from "@/lib/data";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-brown-700/15 bg-white/50">
      <ImagePlaceholder label={product.imageLabel} ratio="square" className="rounded-none rounded-t-2xl border-0" />
      <div className="p-5">
        <div className="text-[11px] font-semibold tracking-[0.15em] text-gold-dark uppercase">
          {product.category}
        </div>
        <h3 className="font-display mt-1 text-lg font-semibold text-brown-900">{product.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-brown-800/70">{product.description}</p>
        <span className="mt-4 inline-block rounded-full bg-brown-900/5 px-3 py-1 text-xs font-medium text-brown-800/70">
          Disponibile in negozio · online a breve
        </span>
      </div>
    </div>
  );
}
