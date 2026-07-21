import Link from "next/link";
import Image from "next/image";
import { Clock, MapPin } from "lucide-react";
import type { ShopRow as Shop } from "@/lib/db/schema";

export default function ShopCard({ shop }: { shop: Shop }) {
  return (
    <div className="card-shadow-soft group rounded-[28px] border border-brown-900/10 bg-white/50 p-6 transition-all duration-700 hover:-translate-y-2 hover:border-brown-900/20 sm:p-10">
      <div className="relative mb-10 h-[300px] overflow-hidden rounded-2xl sm:h-[400px]">
        <Image
          src={shop.image}
          alt={shop.name}
          fill
          className={`object-cover transition-transform duration-[1.5s] group-hover:scale-105 ${
            shop.slug === "centro" ? "group-hover:rotate-1" : "group-hover:-rotate-1"
          }`}
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-brown-950/40 to-transparent" />
      </div>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h3 className="font-display text-3xl text-brown-950 sm:text-4xl">{shop.name}</h3>
          <span className="rounded-full bg-brown-900/5 px-4 py-1.5 text-[10px] font-bold tracking-widest text-brown-900 uppercase">
            {shop.specialty}
          </span>
        </div>
        <p className="text-lg leading-relaxed text-brown-900/60">{shop.tagline}</p>
        <div className="flex flex-col gap-3 pt-4 text-sm font-semibold text-taupe">
          <div className="flex items-center gap-3">
            <MapPin className="size-4 shrink-0 text-gold-dark" />
            {shop.address}
          </div>
          {shop.hours[0] && (
            <div className="flex items-center gap-3">
              <Clock className="size-4 shrink-0 text-gold-dark" />
              {shop.hours[0].label}: {shop.hours[0].value}
            </div>
          )}
        </div>
        <Link
          href={`/negozi/${shop.slug}`}
          data-magnetic
          className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-brown-950 px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brown-900"
        >
          Esplora il negozio
        </Link>
      </div>
    </div>
  );
}
