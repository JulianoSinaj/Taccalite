import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Photo from "@/components/Photo";
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
    <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <Link href="/blog" className="text-sm font-medium text-brown-800/60 hover:text-brown-900">
        ← Tutte le news
      </Link>
      <div className="mt-4 text-xs font-medium text-taupe">{formatDate(post.date)}</div>
      <h1 className="font-display mt-2 text-3xl font-semibold text-brown-900 sm:text-4xl">
        {post.title}
      </h1>
      <Photo src={post.image} alt={post.title} label={post.imageLabel} ratio="wide" className="mt-8" />
      <div className="mt-8 space-y-4 text-base leading-relaxed text-brown-800/80">
        {post.content.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
