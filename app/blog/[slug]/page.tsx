import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import BlogCard from "@/components/BlogCard";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import { blogPosts } from "@/lib/data";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) return {};
  return { title: `${post.title} — Norcineria Taccalite`, description: post.excerpt };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = blogPosts.find((p) => p.slug === slug);
  if (!post) notFound();

  const otherPosts = blogPosts.filter((p) => p.slug !== slug);

  return (
    <div>
      {/* Editorial header band */}
      <section className="relative overflow-hidden bg-[#1c1512] px-5 pt-44 pb-20 sm:px-10 sm:pt-56 sm:pb-28">
        <div className="bg-noise absolute inset-0 opacity-10" />
        <Reveal className="relative mx-auto max-w-4xl">
          <Link
            href="/blog"
            className="group inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.25em] text-cream/60 uppercase transition-colors hover:text-gold"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
            Tutte le news
          </Link>
          <div className="mt-10 flex items-center gap-4">
            <span className="rounded-full bg-gold px-4 py-1.5 text-[9px] font-bold tracking-widest text-brown-950 uppercase">
              {post.category}
            </span>
            <span className="text-[11px] font-semibold tracking-wider text-cream/65 uppercase">
              {formatDate(post.date)}
            </span>
          </div>
          <h1 className="font-display mt-6 text-4xl leading-[1.02] tracking-tighter text-cream sm:text-5xl lg:text-6xl">
            {post.title}
          </h1>
        </Reveal>
      </section>

      {/* Body */}
      <article className="mx-auto max-w-4xl px-5 pb-24 sm:px-8 sm:pb-32">
        <Reveal className="-mt-10 sm:-mt-14">
          {post.image ? (
            <div className="cinematic-shadow relative aspect-[16/9] overflow-hidden rounded-[32px]">
              <Image
                src={post.image}
                alt={post.title}
                fill
                preload
                className="object-cover"
                sizes="(max-width: 896px) 100vw, 896px"
              />
            </div>
          ) : (
            <ImagePlaceholder label={post.imageLabel} ratio="wide" className="rounded-[32px]" />
          )}
        </Reveal>
        <Reveal
          delay={0.1}
          className="mx-auto mt-14 max-w-3xl space-y-7 text-lg leading-relaxed font-light text-brown-900/85 sm:text-xl"
        >
          {post.content.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </Reveal>
        <Reveal delay={0.15} className="mx-auto mt-16 max-w-3xl border-t border-brown-900/10 pt-10">
          <p className="text-sm font-semibold text-brown-800/85">
            Vuoi assaggiare di persona? Passa in bottega o{" "}
            <Link href="/prenotazioni" className="underline-draw font-bold text-gold-deep">
              prenota un tavolo
            </Link>
            .
          </p>
        </Reveal>
      </article>

      {/* Altre storie */}
      {otherPosts.length > 0 && (
        <section className="bg-cream-dark px-5 py-24 sm:px-10 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <Reveal className="mb-14 space-y-5">
              <span className="eyebrow eyebrow-dark block">Continua a leggere</span>
              <h2 className="font-display text-4xl tracking-tighter text-brown-950 sm:text-5xl">
                Altre storie dalla bottega
              </h2>
            </Reveal>
            <RevealStagger className="grid grid-cols-1 gap-10 md:grid-cols-2">
              {otherPosts.map((p) => (
                <RevealStaggerItem key={p.slug}>
                  <BlogCard post={p} />
                </RevealStaggerItem>
              ))}
            </RevealStagger>
          </div>
        </section>
      )}
    </div>
  );
}
