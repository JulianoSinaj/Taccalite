import type { Metadata } from "next";
import ShopCard from "@/components/ShopCard";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { shops } from "@/lib/data";

export const metadata: Metadata = {
  title: "I Nostri Negozi — Norcineria Taccalite",
  description:
    "I due negozi Taccalite ad Ancona: formaggi nel negozio Centro, carni e bistecche nel secondo negozio.",
};

export default function NegoziPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 pt-40 pb-32 sm:px-10 sm:pt-48 sm:pb-48">
      <Reveal className="mb-20 text-center sm:mb-28">
        <span className="eyebrow eyebrow-dark mb-6 block">Le nostre sedi</span>
        <h1 className="font-display text-5xl tracking-tighter text-brown-950 sm:text-6xl md:text-7xl">
          I nostri negozi ad Ancona
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed font-light text-brown-900/60">
          Due negozi, due anime della stessa tradizione di famiglia: scegli quello più vicino a te
          e scopri specialità, orari e indirizzo.
        </p>
      </Reveal>
      <RevealStagger className="grid grid-cols-1 gap-12 md:grid-cols-2">
        {shops.map((shop) => (
          <RevealStaggerItem key={shop.slug}>
            <ShopCard shop={shop} />
          </RevealStaggerItem>
        ))}
      </RevealStagger>
    </div>
  );
}
