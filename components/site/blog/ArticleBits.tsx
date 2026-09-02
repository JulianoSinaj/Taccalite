import Image from "next/image";
import { PhotoCredit } from "@/components/site/PhotoCredit";
import { inline } from "@/components/site/inline-markup";
import { cn } from "@/lib/utils";
import { FIGURE_RATIOS, type ArticleBlock } from "@/lib/blog-article";

/**
 * The parts every article template is built from.
 *
 * The four templates disagree about *placement* — a photograph is a full-bleed
 * band in the photo essay, a framed plate on the book measure, a thumbnail
 * beside a notice — and agree about everything else: a caption is always micro
 * caps under the frame, a link in the body is always the gold `underline-draw`,
 * a photograph that needs a credit always carries one. Keeping the agreement
 * here is what stops four templates from becoming four dialects.
 */

/** Links inside body copy. One treatment, everywhere. */
export const BODY_LINK = "underline-draw font-semibold text-gold-deep";

/** The caption line, and the micro-caps label the templates share with it. */
export const CAPTION =
  "mt-3 text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase";

export function Paragraph({
  text,
  index,
  className,
  dropCap = false,
}: {
  text: string;
  index: number;
  className?: string;
  dropCap?: boolean;
}) {
  return (
    <p className={cn(dropCap && "drop-cap", className)}>{inline(text, `p${index}`, BODY_LINK)}</p>
  );
}

/**
 * A section heading.
 *
 * `number` prints the running count in the margin — the magazine template's
 * device, and the reason the count is passed in rather than derived here: only
 * the template knows whether its sections are numbered.
 */
export function SectionHeading({
  block,
  number,
  className,
}: {
  block: Extract<ArticleBlock, { kind: "heading" }>;
  number?: number;
  className?: string;
}) {
  return (
    <h2 id={block.id} className={cn("scroll-mt-28", className)}>
      {number !== undefined && (
        <span
          aria-hidden
          className="mb-3 block text-[0.6875rem] font-semibold tracking-[0.22em] text-[var(--acc)] tabular-nums"
        >
          {String(number).padStart(2, "0")}
        </span>
      )}
      {block.text}
    </h2>
  );
}

/**
 * A photograph with its caption.
 *
 * `sizes` is required rather than defaulted: the same component renders at 38rem
 * on a book measure and at 100vw in a photo essay, and a wrong `sizes` is
 * invisible on a fast connection and expensive on a slow one.
 */
export function Figure({
  block,
  sizes,
  className,
  frameClassName,
  captionClassName,
  eager = false,
}: {
  block: Extract<ArticleBlock, { kind: "figure" }>;
  sizes: string;
  className?: string;
  frameClassName?: string;
  captionClassName?: string;
  eager?: boolean;
}) {
  return (
    <figure className={className}>
      <div
        className={cn("relative overflow-hidden bg-paper-deep", frameClassName)}
        style={{ aspectRatio: FIGURE_RATIOS[block.ratio] }}
      >
        {/* `alt=""`, not the caption. The caption is right below as visible
            text in the same `<figure>`, so putting it in `alt` as well makes a
            screen reader read it twice — once as the image and once as its
            caption. An empty alt is the correct answer when the picture is
            already described on the page. */}
        <Image
          src={block.src}
          alt=""
          fill
          sizes={sizes}
          {...(eager ? { preload: true } : {})}
          className="object-cover"
        />
        {/* The frame is `relative` already, which is all the credit needs. A
            photograph whose licence requires attribution must carry it wherever
            it appears — including inside a post body, which is a new place for
            one of these files to turn up. */}
        <PhotoCredit src={block.src} />
        <span aria-hidden className="absolute inset-0 border border-brown-950/8" />
      </div>
      {block.caption && (
        <figcaption className={cn(CAPTION, captionClassName)}>{block.caption}</figcaption>
      )}
    </figure>
  );
}

/**
 * A pull quote, in the three shapes the templates want.
 *
 * `rule` hangs it off a heavy accent rule (the long read), `centred` sets it as
 * display type in the middle of a band (the photo essay), `margin` runs it
 * across the gutter of the magazine spread.
 */
export function PullQuote({
  block,
  variant,
  className,
}: {
  block: Extract<ArticleBlock, { kind: "quote" }>;
  variant: "rule" | "centred" | "margin";
  className?: string;
}) {
  const attribution = block.attribution && (
    <figcaption
      className={cn(
        "mt-5 text-[0.6875rem] font-semibold tracking-[0.2em] text-taupe uppercase",
        variant === "centred" && "text-center",
      )}
    >
      {block.attribution}
    </figcaption>
  );

  if (variant === "centred") {
    return (
      <figure className={cn("mx-auto max-w-[44rem] text-center", className)}>
        <span aria-hidden className="mx-auto mb-8 block h-px w-16 bg-[var(--acc)]" />
        <blockquote className="font-display text-[1.75rem] leading-[1.25] font-semibold text-balance text-brown-950 sm:text-[2.25rem]">
          {block.text}
        </blockquote>
        {attribution}
      </figure>
    );
  }

  if (variant === "margin") {
    return (
      <figure className={cn("border-t border-rule-strong pt-7", className)}>
        <blockquote className="font-display text-[1.5rem] leading-[1.2] font-semibold text-brown-950 sm:text-[1.875rem]">
          {block.text}
        </blockquote>
        {attribution}
      </figure>
    );
  }

  return (
    <figure className={cn("border-l-2 border-[var(--acc)] pl-6 sm:pl-8", className)}>
      <blockquote className="font-display text-[1.5rem] leading-[1.22] font-semibold text-brown-950 sm:text-[1.75rem]">
        {block.text}
      </blockquote>
      {attribution}
    </figure>
  );
}

/**
 * The practical facts — hours, a place, a deadline — as rows rather than as a
 * sentence somebody has to read twice to find the time in.
 *
 * `card` boxes them (the notice leads with this); `rows` is the hairline list
 * the other templates drop mid-article.
 */
export function FactsTable({
  rows,
  variant,
  className,
}: {
  rows: { label: string; value: string }[];
  variant: "card" | "rows";
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-8 sm:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]",
        variant === "card" ? "gap-y-4" : "gap-y-5",
        className,
      )}
    >
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            "grid gap-x-8 gap-y-1 border-t border-rule pt-4 sm:col-span-2 sm:grid-cols-subgrid",
            i === 0 && variant === "card" && "border-t-0 pt-0",
          )}
        >
          <dt className="text-[0.6875rem] font-semibold tracking-[0.18em] text-[var(--acc)] uppercase">
            {row.label}
          </dt>
          <dd className="leading-relaxed text-brown-800">{inline(row.value, `f${i}`, BODY_LINK)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A bullet list. The marker is the site's own rotated square, never a disc. */
export function ArticleList({
  items,
  index,
  className,
}: {
  items: string[];
  index: number;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-3.5", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-4">
          <span
            aria-hidden
            className="mt-[0.6em] size-[5px] shrink-0 rotate-45 bg-[var(--acc)]"
          />
          <span>{inline(item, `l${index}-${i}`, BODY_LINK)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Category · date · reading time, the line every template opens with. */
export function ArticleMeta({
  category,
  date,
  minutes,
  className,
  tone = "paper",
}: {
  category: string;
  date: string;
  minutes: number;
  className?: string;
  tone?: "paper" | "dark";
}) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.6875rem] font-semibold tracking-[0.2em] uppercase",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-2.5",
          tone === "dark" ? "text-gold" : "text-[var(--acc)]",
        )}
      >
        <span
          aria-hidden
          className={cn("size-[5px] rotate-45", tone === "dark" ? "bg-gold" : "bg-[var(--acc)]")}
        />
        {category}
      </span>
      <span aria-hidden className={tone === "dark" ? "text-cream/55" : "text-tan"}>
        /
      </span>
      {/* Date and reading time are one flex item, not two with a separator
          between them: three items and two separators wrap on a phone with a
          slash stranded at the end of the first line. */}
      <span className={tone === "dark" ? "text-cream/85" : "text-taupe"}>
        {date} · {minutes} min di lettura
      </span>
    </p>
  );
}
