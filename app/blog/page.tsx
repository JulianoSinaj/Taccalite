import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import BlogCard from "@/components/BlogCard";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { blogPosts } from "@/lib/data";

export const metadata: Metadata = {
  title: "News — Norcineria Taccalite",
  description:
    "Storie, novità e appuntamenti dai negozi Taccalite ad Ancona: nuovi arrivi, orari e la porchetta del sabato.",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BlogPage() {
  const [featured, ...rest] = blogPosts;

  return (
    <div>
      {/* Hero band */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-44 pb-24 sm:px-10 sm:pt-56 sm:pb-32">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <div className="parallax-orb absolute -top-52 -left-52 h-[48rem] w-[48rem] opacity-10" />
        <Reveal className="relative mx-auto max-w-7xl">
          <span className="eyebrow mb-8 block">Il diario della bottega</span>
          <h1 className="font-display max-w-4xl text-5xl leading-[0.95] tracking-tighter text-cream sm:text-7xl md:text-8xl">
            Storie, novità
            <br />
            <span className="text-gold italic">e tradizioni</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed font-light text-cream/75">
            Nuovi arrivi al banco, appuntamenti in bottega e l&apos;immancabile porchetta del
            sabato: tutto quello che succede in casa Taccalite.
          </p>
        </Reveal>
      </section>

      {/* Featured post */}
      {featured && (
        <section className="bg-cream px-5 pt-24 sm:px-10 sm:pt-32">
          <Reveal className="mx-auto max-w-7xl">
            <Link
              href={`/blog/${featured.slug}`}
              className="group card-shadow-soft grid grid-cols-1 overflow-hidden rounded-[32px] border border-brown-900/10 bg-white/60 transition-all duration-700 hover:-translate-y-2 lg:grid-cols-2"
            >
              <div className="relative aspect-[16/10] overflow-hidden lg:aspect-auto lg:min-h-[420px]">
                {featured.image ? (
                  <Image
                    src={featured.image}
                    alt={featured.title}
                    fill
                    preload
                    className="object-cover transition-transform duration-[1.8s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                ) : (
                  <ImagePlaceholder
                    label={featured.imageLabel}
                    ratio="wide"
                    className="h-full rounded-none border-0"
                  />
                )}
                <span className="absolute top-6 left-6 rounded-full bg-gold px-4 py-1.5 text-[10px] font-bold tracking-widest text-brown-950 uppercase">
                  In evidenza
                </span>
              </div>
              <div className="flex flex-col justify-center space-y-6 p-8 sm:p-14">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold tracking-wider text-brown-800/70 uppercase">
                    {formatDate(featured.date)}
                  </span>
                  <span className="rounded-full bg-gold/15 px-3 py-1 text-[9px] font-bold tracking-widest text-gold-deep uppercase">
                    {featured.category}
                  </span>
                </div>
                <h2 className="font-display text-3xl leading-tight tracking-tight text-brown-950 transition-colors group-hover:text-gold-deep sm:text-4xl lg:text-5xl">
                  {featured.title}
                </h2>
                <p className="max-w-md text-lg leading-relaxed font-light text-brown-900/70">
                  {featured.excerpt}
                </p>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-gold-deep transition-all group-hover:gap-4">
                  Leggi la storia
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </Link>
          </Reveal>
        </section>
      )}

      {/* Remaining posts */}
      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-10 sm:py-32">
        <RevealStagger className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((post) => (
            <RevealStaggerItem key={post.slug}>
              <BlogCard post={post} />
            </RevealStaggerItem>
          ))}
        </RevealStagger>
      </section>
    </div>
  );
}
