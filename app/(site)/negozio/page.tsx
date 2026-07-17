import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getPurchasableProducts, getSetting } from "@/lib/db/queries";
import AddToCartButton from "@/components/store/AddToCartButton";
import { formatEuro } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "E-Shop",
  description:
    "Ordina online le specialità della Norcineria Taccalite: porchetta, salumi e formaggi, con ritiro in bottega o spedizione.",
};

export default async function StorePage() {
  const [products, storeEnabled] = await Promise.all([
    getPurchasableProducts(),
    getSetting<boolean>("store.enabled", true),
  ]);

  return (
    <div>
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-44 pb-20 sm:px-10 sm:pt-56 sm:pb-24">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="relative mx-auto max-w-7xl">
          <span className="eyebrow mb-6 block">La bottega online</span>
          <h1 className="font-display max-w-3xl text-5xl leading-[0.95] tracking-tighter text-cream sm:text-7xl">
            Le nostre specialità, <span className="text-gold italic">a casa tua</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg font-light text-cream/75">
            Ordina online e scegli il ritiro in bottega o la spedizione. Stessa qualità del banco.
          </p>
        </div>
      </section>

      <section className="bg-cream px-5 py-20 sm:px-10 sm:py-28">
        <div className="mx-auto max-w-7xl">
          {!storeEnabled || products.length === 0 ? (
            <div className="rounded-[28px] border border-brown-900/10 bg-white/60 p-12 text-center">
              <h2 className="font-display text-3xl text-brown-950">Negozio in allestimento</h2>
              <p className="mt-3 text-brown-900/70">
                Le vendite online saranno presto disponibili. Nel frattempo passa in bottega o{" "}
                <Link href="/prenotazioni" className="font-semibold text-gold-deep underline">
                  prenota la tua porchetta
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-[24px] border border-brown-900/10 bg-white/60"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-cream-dark">
                    {p.image ? (
                      <Image src={p.image} alt={p.name} fill className="object-cover" sizes="(max-width:1024px) 100vw, 33vw" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs font-bold tracking-widest text-brown-800/40 uppercase">
                        {p.imageLabel || p.name}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <p className="text-[10px] font-bold tracking-widest text-gold-deep uppercase">{p.category}</p>
                    <h3 className="font-display mt-1 text-2xl text-brown-950">{p.name}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-brown-900/70">{p.description}</p>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="font-display text-2xl font-bold text-brown-950">
                        {formatEuro(p.priceCents ?? 0)}
                      </span>
                      {p.unit && <span className="text-sm text-brown-800/60">/ {p.unit}</span>}
                    </div>
                    <AddToCartButton
                      product={{
                        slug: p.slug,
                        name: p.name,
                        priceCents: p.priceCents ?? 0,
                        unit: p.unit,
                        image: p.image,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
