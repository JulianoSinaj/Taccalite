import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/Reveal";
import ProductPlate from "@/components/site/ProductPlate";
import { categoryAccent } from "@/lib/categories";

export type DiarioPost = {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  image: string | null;
  /** Pre-formatted in the query layer — building it here trips the compiler's
   *  impure-render rule, and the page is where a date is hardest to test. */
  dateLabel: string;
};

export default function Diario({ posts }: { posts: DiarioPost[] }) {
  if (posts.length === 0) return null;

  return (
    <section className="bg-paper-warm px-5 py-24 sm:px-8 sm:py-32 lg:px-12">
      <div className="mx-auto max-w-[88rem]">
        <div className="flex flex-col justify-between gap-7 border-b border-rule pb-10 md:flex-row md:items-end">
          <div>
            <p className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
              <span aria-hidden className="h-px w-10 bg-gold" />
              Dal diario
            </p>
            <h2 className="font-display display-lg mt-7 max-w-2xl font-semibold text-brown-950">
              Fiere, arrivi e <span className="wonk text-gold-deep">storie di bottega</span>
            </h2>
          </div>
          <Link
            href="/blog"
            className="group inline-flex shrink-0 items-center gap-3 border-b border-gold/50 pb-1 text-[0.6875rem] font-semibold tracking-[0.2em] text-brown-950 uppercase transition-[gap,color] duration-500 hover:gap-5 hover:text-gold-deep focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            Tutte le storie
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        <div className="mt-12 grid gap-x-8 gap-y-12 md:grid-cols-3">
          {posts.map((post, i) => (
            <Reveal key={post.slug} delay={i * 0.07}>
              <article
                className="group flex h-full flex-col"
                style={{ "--acc": categoryAccent(post.category) } as React.CSSProperties}
              >
                <Link
                  href={`/blog/${post.slug}`}
                  className="relative block aspect-3/2 overflow-hidden bg-paper focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                >
                  {post.image ? (
                    <Image
                      src={post.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 90vw, 30vw"
                      className="object-cover transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
                    />
                  ) : (
                    // Most posts carry no photograph, so the fallback is the
                    // same printed plate the shop grid uses — one language for
                    // "we have no picture of this", not two.
                    <ProductPlate
                      name={post.title}
                      category={post.category}
                      seed={post.slug}
                      className="transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute inset-0 border border-brown-950/8 transition-colors duration-500 group-hover:border-[color-mix(in_oklab,var(--acc)_55%,transparent)]"
                  />
                </Link>

                <p className="mt-5 flex items-center gap-3 text-[0.625rem] font-semibold tracking-[0.22em] text-[var(--acc)] uppercase">
                  {post.category}
                  <span aria-hidden className="size-[3px] rounded-full bg-tan" />
                  <span className="text-taupe">{post.dateLabel}</span>
                </p>

                <h3 className="font-display mt-3 text-[1.375rem] leading-snug font-semibold tracking-[-0.02em] text-brown-950">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="transition-colors hover:text-gold-deep focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                  >
                    {post.title}
                  </Link>
                </h3>

                <p className="mt-3 line-clamp-3 text-[0.9375rem] leading-relaxed text-brown-700">
                  {post.excerpt}
                </p>

                <Link
                  href={`/blog/${post.slug}`}
                  className="mt-5 inline-flex items-center gap-2.5 self-start border-b border-gold/50 pb-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-brown-950 uppercase transition-[gap] duration-500 hover:gap-4 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
                >
                  Scopri di più
                  <ArrowRight className="size-3.5 text-gold-deep" aria-hidden />
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
