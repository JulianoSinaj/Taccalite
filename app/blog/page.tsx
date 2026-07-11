import type { Metadata } from "next";
import BlogCard from "@/components/BlogCard";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { blogPosts } from "@/lib/data";

export const metadata: Metadata = {
  title: "News — Norcineria Taccalite",
  description: "Novità, eventi e aggiornamenti dai negozi Taccalite ad Ancona.",
};

export default function BlogPage() {
  return (
    <div className="pt-32 sm:pt-40">
      <Reveal className="mx-auto max-w-7xl px-5 py-16 text-center sm:px-8 sm:py-24">
        <span className="eyebrow eyebrow-dark mb-6 block">Dal nostro blog</span>
        <h1 className="font-display mb-8 text-5xl leading-none tracking-tighter text-brown-950 sm:text-6xl md:text-7xl">
          Storie, novità e tradizioni
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-relaxed font-light text-brown-900/60 italic md:text-xl">
          Un viaggio nel cuore della cultura norcina marchigiana, dove l&apos;eredità di famiglia
          incontra l&apos;eccellenza del territorio.
        </p>
      </Reveal>
      <section className="mx-auto max-w-7xl px-5 pb-32 sm:px-8 sm:pb-48">
        <RevealStagger className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
          {blogPosts.map((post) => (
            <RevealStaggerItem key={post.slug}>
              <BlogCard post={post} />
            </RevealStaggerItem>
          ))}
        </RevealStagger>
      </section>
    </div>
  );
}
