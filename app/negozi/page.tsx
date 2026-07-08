import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import ShopCard from "@/components/ShopCard";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { shops } from "@/lib/data";

export const metadata: Metadata = {
  title: "I Nostri Negozi — Norcineria Taccalite",
  description: "I due negozi Taccalite ad Ancona: formaggi nel negozio Centro, carni e bistecche nel secondo negozio.",
};

export default function NegoziPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Ancona"
          title="I nostri negozi"
          description="Due negozi, due anime della stessa tradizione di famiglia: scegli quello più vicino a te e scopri specialità, orari e indirizzo."
        />
      </Reveal>
      <RevealStagger className="mt-10 grid gap-6 sm:grid-cols-2">
        {shops.map((shop) => (
          <RevealStaggerItem key={shop.slug}>
            <ShopCard shop={shop} />
          </RevealStaggerItem>
        ))}
      </RevealStagger>
    </div>
  );
}
