import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import Reveal from "@/components/Reveal";
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

  return (
    <article className="mx-auto max-w-3xl px-5 pt-40 pb-32 sm:px-8 sm:pt-48 sm:pb-48">
      <Reveal>
        <Link
          href="/blog"
          className="group inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-brown-800/60 uppercase transition-colors hover:text-brown-950"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
          Tutte le news
        </Link>
        <div className="mt-8 flex items-center gap-3">
          <span className="text-[10px] font-semibold tracking-wider text-taupe uppercase">
            {formatDate(post.date)}
          </span>
          <span className="rounded-full bg-gold/10 px-3 py-1 text-[9px] font-bold tracking-widest text-gold-dark uppercase">
            {post.category}
          </span>
        </div>
        <h1 className="font-display mt-4 text-4xl leading-tight font-semibold tracking-tighter text-brown-950 sm:text-5xl">
          {post.title}
        </h1>
      </Reveal>
      <Reveal delay={0.1} className="mt-10">
        {post.image ? (
          <div className="cinematic-shadow relative aspect-[16/9] overflow-hidden rounded-[32px]">
            <Image
              src={post.image}
              alt={post.title}
              fill
              preload
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
            />
          </div>
        ) : (
          <ImagePlaceholder label={post.imageLabel} ratio="wide" className="rounded-[32px]" />
        )}
      </Reveal>
      <Reveal delay={0.15} className="mt-12 space-y-6 text-lg leading-relaxed font-light text-brown-800/80">
        {post.content.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </Reveal>
    </article>
  );
}
