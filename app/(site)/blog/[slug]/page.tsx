import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import BlogCard from "@/components/BlogCard";
import ProductPlate from "@/components/site/ProductPlate";
import { categoryAccent } from "@/lib/categories";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import JsonLd from "@/components/JsonLd";
import { articleSchema, breadcrumbSchema } from "@/lib/seo";
import { getBlogPostBySlug, getBlogPosts } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return {};
  // The editor can set a search-result title and snippet separately from the
  // on-page title and the listing blurb; both fall back to those.
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
  };
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
  const [post, allPosts] = await Promise.all([getBlogPostBySlug(slug), getBlogPosts()]);
  if (!post) notFound();

  const otherPosts = allPosts.filter((p) => p.slug !== slug);

  return (
    <div>
      <JsonLd
        schema={[
          articleSchema(post),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "News", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
      {/* Editorial header band */}
      <section className="px-5 pt-28 pb-12 sm:px-8 sm:pt-32 lg:px-12">
        <Reveal className="mx-auto max-w-[46rem]">
          <Link
            href="/blog"
            className="group tap inline-flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.22em] text-taupe uppercase transition-colors hover:text-brown-950"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
            Tutte le news
          </Link>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <span
              style={{ "--acc": categoryAccent(post.category) } as React.CSSProperties}
              className="inline-flex items-center gap-2.5 bg-[color-mix(in_oklab,var(--acc)_14%,var(--paper))] px-4 py-1.5 text-[0.625rem] sm:text-[0.5625rem] font-semibold tracking-[0.2em] text-[var(--acc)] uppercase"
            >
              <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
              {post.category}
            </span>
            <span className="text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase">
              {formatDate(post.date)}
            </span>
          </div>
          <h1 className="font-display display-lg mt-7 font-semibold text-brown-950">
            {post.title}
          </h1>
        </Reveal>
      </section>

      {/* Body */}
      <article className="mx-auto max-w-[46rem] px-5 pb-16 sm:px-8 sm:pb-20">
        <Reveal>
          {/* Flat on the paper: the rounded slab with a cinematic drop shadow
              belonged to the old dark art direction. */}
          <div className="relative">
            <div className="relative aspect-[16/9] overflow-hidden bg-paper-deep">
              {post.image ? (
                <Image
                  src={post.image}
                  alt={post.title}
                  fill
                  preload
                  className="object-cover"
                  sizes="(max-width: 896px) 100vw, 896px"
                />
              ) : (
                <ProductPlate
                  name={post.title}
                  category={post.category}
                  seed={post.slug}
                />
              )}
            </div>
          </div>
        </Reveal>
        <Reveal
          delay={0.1}
          className="mt-16 space-y-7 text-lg leading-[1.75] text-brown-700"
        >
          {post.content.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </Reveal>
        <Reveal delay={0.15} className="mt-16 border-t border-rule pt-10">
          <p className="text-[0.9375rem] text-brown-700">
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
        <section className="bg-paper-warm px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-[88rem]">
            <Reveal className="mb-14 border-b border-rule pb-10">
              <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
                <span aria-hidden className="h-px w-10 bg-gold" />
                Continua a leggere
              </p>
              <h2 className="font-display display-lg mt-7 font-semibold text-brown-950">
                Altre storie <span className="wonk text-gold-deep">dalla bottega</span>
              </h2>
            </Reveal>
            <RevealStagger className="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
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
