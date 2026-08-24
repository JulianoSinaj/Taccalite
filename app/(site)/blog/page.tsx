import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import BlogCard from "@/components/BlogCard";
import ProductPlate from "@/components/site/ProductPlate";
import Reveal, { RevealStagger, RevealStaggerItem } from "@/components/Reveal";
import PageHero from "@/components/site/PageHero";
import { categoryAccent } from "@/lib/categories";
import { getBlogPosts } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "News",
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

export default async function BlogPage() {
  const blogPosts = await getBlogPosts();
  const [featured, ...rest] = blogPosts;

  return (
    <div>
      <PageHero
        eyebrow="Il diario della bottega"
        title={[
          "Storie, novità",
          <span key="2" className="wonk text-gold-deep">
            e tradizioni
          </span>,
        ]}
        lede="Nuovi arrivi al banco, appuntamenti in bottega e l'immancabile porchetta del sabato: tutto quello che succede in casa Taccalite."
        aside={
          /* The featured story as a postcard on the desk, two blanks behind it.
             This *is* the featured treatment — the page used to run it here and
             then again as a full-width panel two hundred pixels below, so the
             first thing the diary said was the same thing twice. */
          featured ? (
            <div className="relative mx-auto hidden w-full max-w-md lg:block">
              <div className="absolute inset-0 rotate-6 border border-rule bg-paper-warm" />
              <div className="absolute inset-0 rotate-3 border border-rule bg-paper-warm" />

              <Link
                href={`/blog/${featured.slug}`}
                style={{ "--acc": categoryAccent(featured.category) } as React.CSSProperties}
                className="group card-shadow-soft relative block -rotate-2 overflow-hidden border border-rule bg-paper p-4 pb-14 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform hover:rotate-0 focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
              >
                <div className="relative aspect-[5/4] overflow-hidden bg-paper-deep">
                  {featured.image ? (
                    <Image
                      src={featured.image}
                      alt={featured.title}
                      fill
                      preload
                      className="object-cover transition-transform duration-[1.8s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                      sizes="(max-width: 1024px) 0px, 40vw"
                    />
                  ) : (
                    <ProductPlate
                      name={featured.title}
                      category={featured.category}
                      seed={featured.slug}
                    />
                  )}
                </div>
                <div className="mt-5 flex items-end justify-between gap-4 px-2">
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-2 text-[0.625rem] sm:text-[0.5625rem] font-bold tracking-[0.22em] text-[var(--acc)] uppercase">
                      <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
                      {featured.category}
                    </span>
                    <p className="font-display max-w-[16rem] text-xl leading-tight font-semibold text-brown-950">
                      {featured.title}
                    </p>
                  </div>
                  <span className="rotate-3 border border-rule-strong px-2.5 py-1.5 text-[0.625rem] sm:text-[0.5625rem] font-bold tracking-[0.2em] whitespace-nowrap text-taupe uppercase">
                    {formatDate(featured.date)}
                  </span>
                </div>
              </Link>

              {/* Tape strip */}
              <span
                aria-hidden
                className="absolute -top-4 left-1/2 h-8 w-28 -translate-x-1/2 -rotate-3 bg-gold/35"
              />
            </div>
          ) : null
        }
      />

      <section className="mx-auto max-w-[88rem] px-5 pb-16 sm:px-8 sm:pb-20 lg:px-12">
        <div className="flex items-end justify-between gap-6 border-b border-rule pb-8">
          <h2 className="flex items-center gap-4 text-[0.6875rem] font-semibold tracking-[0.28em] text-gold-deep uppercase">
            <span aria-hidden className="h-px w-10 bg-gold" />
            Tutte le storie
          </h2>
          <p className="text-[0.8125rem] text-taupe tabular-nums">
            {blogPosts.length} {blogPosts.length === 1 ? "articolo" : "articoli"}
          </p>
        </div>

        {/* The featured story reappears here only below `lg`, where the postcard
            in the masthead is hidden — otherwise the phone would never see it. */}
        {featured && (
          <Reveal className="mt-12 lg:hidden">
            <BlogCard post={featured} />
          </Reveal>
        )}

        <RevealStagger className="mt-12 grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((post) => (
            <RevealStaggerItem key={post.slug}>
              <BlogCard post={post} />
            </RevealStaggerItem>
          ))}
        </RevealStagger>

        {blogPosts.length === 0 && (
          <div className="mt-12 border border-rule bg-paper-warm p-12 text-center">
            <h3 className="font-display display-md text-brown-950">Ancora nulla da raccontare</h3>
            <p className="mt-3 text-brown-700">
              Le prime storie della bottega arrivano presto. Nel frattempo,{" "}
              <Link href="/negozio" className="font-semibold text-gold-deep underline">
                dai un&apos;occhiata al banco
              </Link>
              .
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
