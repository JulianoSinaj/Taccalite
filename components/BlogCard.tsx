import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import ProductPlate from "@/components/site/ProductPlate";
import { categoryAccent } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { BlogPostRow as BlogPost } from "@/lib/db/schema";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * A story in the diary.
 *
 * The same card the homepage runs, so the three posts a visitor meets there and
 * the full list they land on here are recognisably one thing. It used to be a
 * rounded white panel with a lift-on-hover shadow — the last of the old
 * card-and-pill language, and the reason `/blog` read as a different site.
 *
 * `lead` gives the first story on the index a horizontal split across two
 * columns: hierarchy without a second, differently-built "featured" component.
 */
export default function BlogCard({ post, lead = false }: { post: BlogPost; lead?: boolean }) {
  const media = post.image ? (
    <Image
      src={post.image}
      alt=""
      fill
      className="object-cover transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
      sizes={lead ? "(max-width: 1024px) 100vw, 50vw" : "(max-width: 768px) 100vw, 33vw"}
    />
  ) : (
    <ProductPlate
      name={post.title}
      category={post.category}
      seed={post.slug}
      className="transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
    />
  );

  return (
    <article
      className={cn("group flex h-full flex-col", lead && "lg:grid lg:grid-cols-2 lg:gap-10")}
      style={{ "--acc": categoryAccent(post.category) } as React.CSSProperties}
    >
      <Link
        href={`/blog/${post.slug}`}
        tabIndex={-1}
        aria-hidden
        className={cn(
          "relative block overflow-hidden bg-paper-deep",
          lead ? "aspect-4/3 lg:aspect-[5/4]" : "aspect-3/2"
        )}
      >
        {media}
        <span
          aria-hidden
          className="absolute inset-0 border border-brown-950/8 transition-colors duration-500 group-hover:border-[color-mix(in_oklab,var(--acc)_55%,transparent)]"
        />
      </Link>

      <div className={cn("flex flex-1 flex-col", lead ? "pt-6 lg:justify-center lg:pt-0" : "pt-5")}>
        <p className="flex items-center gap-3 text-[0.625rem] font-semibold tracking-[0.22em] text-[var(--acc)] uppercase">
          <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
          {post.category}
          <span aria-hidden className="size-[3px] rounded-full bg-tan" />
          <span className="text-taupe">{formatDate(post.date)}</span>
        </p>

        <h2
          className={cn(
            "font-display mt-3 font-semibold tracking-[-0.02em] text-brown-950",
            lead ? "display-md" : "text-[1.375rem] leading-snug"
          )}
        >
          <Link
            href={`/blog/${post.slug}`}
            className="transition-colors hover:text-[var(--acc)] focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:outline-none"
          >
            {post.title}
          </Link>
        </h2>

        <p
          className={cn(
            "mt-3 leading-relaxed text-brown-700",
            lead ? "max-w-md text-base" : "line-clamp-3 text-[0.9375rem]"
          )}
        >
          {post.excerpt}
        </p>

        <Link
          href={`/blog/${post.slug}`}
          tabIndex={-1}
          aria-hidden
          className="tap mt-5 inline-flex items-center gap-2.5 self-start border-b border-gold/50 pb-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-brown-950 uppercase transition-[gap] duration-500 hover:gap-4"
        >
          Leggi la storia
          <ArrowRight className="size-3.5 text-[var(--acc)]" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
