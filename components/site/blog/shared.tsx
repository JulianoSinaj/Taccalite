import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import ProductPlate from "@/components/site/ProductPlate";
import { PhotoCredit } from "@/components/site/PhotoCredit";
import { cn } from "@/lib/utils";
import type { ArticleBlock } from "@/lib/blog-article";
import type { BlogPostRow } from "@/lib/db/schema";
import { CAPTION } from "./ArticleBits";

/** What every template is handed. Parsed once by the page, not four times. */
export type TemplateProps = {
  post: BlogPostRow;
  blocks: ArticleBlock[];
  /** Already formatted — a template must not call `new Date()` while rendering. */
  date: string;
  minutes: number;
};

export function ArticleBackLink({
  tone = "paper",
  className,
}: {
  tone?: "paper" | "dark";
  className?: string;
}) {
  return (
    <Link
      href="/blog"
      className={cn(
        "group tap inline-flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.22em] uppercase transition-colors",
        tone === "dark" ? "text-cream/85 hover:text-cream" : "text-taupe hover:text-brown-950",
        className,
      )}
    >
      <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
      Tutte le news
    </Link>
  );
}

/**
 * The post's own cover photograph — or the printed plate that stands in for one.
 *
 * Twenty of twenty-four products have no photograph and the diary is no
 * different, so the fallback is the majority case rather than an edge one:
 * `<Image src="">` renders a silent blank box, which is exactly the bug this
 * component exists to make impossible.
 */
export function HeroMedia({
  post,
  className,
  aspectClassName,
  sizes,
  showCaption = true,
}: {
  post: BlogPostRow;
  className?: string;
  aspectClassName: string;
  sizes: string;
  showCaption?: boolean;
}) {
  const caption = showCaption ? post.imageLabel : "";
  return (
    <figure className={className}>
      <div className={cn("relative overflow-hidden bg-paper-deep", aspectClassName)}>
        {post.image ? (
          <>
            {/* Empty when the caption is shown below the frame (it says the
                same thing, and a screen reader would read it twice); the label
                otherwise, since then nothing else on the page describes the
                photograph. */}
            <Image
              src={post.image}
              alt={caption ? "" : post.imageLabel || post.title}
              fill
              preload
              sizes={sizes}
              className="object-cover"
            />
            <PhotoCredit src={post.image} />
          </>
        ) : (
          <ProductPlate name={post.title} category={post.category} seed={post.slug} />
        )}
        <span aria-hidden className="absolute inset-0 border border-brown-950/8" />
      </div>
      {caption && <figcaption className={CAPTION}>{caption}</figcaption>}
    </figure>
  );
}

/**
 * The end of the article: what to do now that you have read it.
 *
 * Every post used to end on the same sentence about booking a table, including
 * the one announcing holiday opening hours — where the useful next step is the
 * shops page, not a reservation. Three shapes, and the template picks the one
 * that fits the piece it just finished.
 */
export function ArticleClose({
  variant,
  className,
}: {
  variant: "rule" | "card" | "band";
  className?: string;
}) {
  const body = (
    <>
      Vuoi assaggiare di persona? Passa in bottega — trovi indirizzi e orari nella pagina{" "}
      <Link href="/sedi" className="underline-draw font-semibold text-gold-deep">
        dei negozi
      </Link>{" "}
      — oppure{" "}
      <Link href="/prenotazioni" className="underline-draw font-semibold text-gold-deep">
        prenota un tavolo
      </Link>
      .
    </>
  );

  if (variant === "band") {
    return (
      <section className={cn("bg-paper-warm px-5 py-16 sm:px-8 sm:py-20 lg:px-12", className)}>
        <div className="mx-auto max-w-[40rem] text-center">
          <p className="eyebrow text-gold-deep">Dopo la lettura</p>
          <p className="mt-6 text-[1.0625rem] leading-relaxed text-brown-800">{body}</p>
        </div>
      </section>
    );
  }

  if (variant === "card") {
    return (
      <div className={cn("border border-rule-strong bg-paper-warm p-7 sm:p-9", className)}>
        <p className="eyebrow text-gold-deep">Dopo la lettura</p>
        <p className="mt-5 text-[0.9375rem] leading-relaxed text-brown-800">{body}</p>
      </div>
    );
  }

  return (
    <div className={cn("mt-16 border-t border-rule pt-10", className)}>
      <p className="text-[0.9375rem] leading-relaxed text-brown-700">{body}</p>
    </div>
  );
}
