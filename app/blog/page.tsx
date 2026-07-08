import type { Metadata } from "next";
import SectionHeading from "@/components/SectionHeading";
import BlogCard from "@/components/BlogCard";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { blogPosts } from "@/lib/data";

export const metadata: Metadata = {
  title: "News — Norcineria Taccalite",
  description: "Novità, eventi e aggiornamenti dai negozi Taccalite ad Ancona.",
};

export default function BlogPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <Reveal>
        <SectionHeading
          eyebrow="Blog"
          title="News dalla norcineria"
          description="Aggiornamenti su nuovi prodotti, eventi in negozio e orari straordinari."
        />
      </Reveal>
      <RevealStagger className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {blogPosts.map((post) => (
          <RevealStaggerItem key={post.slug}>
            <BlogCard post={post} />
          </RevealStaggerItem>
        ))}
      </RevealStagger>
    </div>
  );
}
