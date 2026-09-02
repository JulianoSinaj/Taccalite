import Reveal from "@/components/Reveal";
import { cn } from "@/lib/utils";
import type { ArticleBlock } from "@/lib/blog-article";
import {
  ArticleList,
  Figure,
  FactsTable,
  Paragraph,
  PullQuote,
  SectionHeading,
} from "./ArticleBits";
import { ArticleBackLink, ArticleClose, type TemplateProps } from "./shared";

/**
 * **Avviso** — the notice on the door.
 *
 * A single printed sheet with a torn corner (`.ticket`, the same clip the price
 * stamps use), a coloured header strip, and the facts in a table at the top
 * where somebody scanning for a time will find them. Compact measure, tighter
 * leading, no drop cap, no cover photograph — a change of opening hours is not
 * a story and giving it the full editorial treatment reads as a shop that
 * cannot tell the difference.
 *
 * The one template that deliberately looks *smaller* than the others.
 */
export default function Avviso({ post, blocks, date, minutes }: TemplateProps) {
  return (
    <article className="px-5 pt-28 pb-16 sm:px-8 sm:pt-32 sm:pb-20 lg:px-12">
      <div className="mx-auto max-w-[46rem]">
        <Reveal>
          <ArticleBackLink />
        </Reveal>

        <Reveal delay={0.05} className="mt-9">
          {/* No shadow: `clip-path` clips a `box-shadow` along with the box, so
              `card-shadow-soft` here renders nothing at all — and the storefront
              is flat paper anyway. The notch is the whole device. */}
          <div className="ticket border border-rule-strong bg-paper">
            {/* The header strip: what kind of notice, and from when. */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule-strong bg-[color-mix(in_oklab,var(--acc)_14%,var(--paper))] px-6 py-4 sm:px-9">
              <p className="flex items-center gap-2.5 text-[0.6875rem] font-semibold tracking-[0.2em] text-[var(--acc)] uppercase">
                <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
                {post.category}
              </p>
              <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-brown-700 uppercase">
                {date} · {minutes} min
              </p>
            </div>

            <div className="px-6 py-9 sm:px-9 sm:py-11">
              <h1 className="font-display text-[1.875rem] leading-[1.1] font-semibold text-balance text-brown-950 sm:text-[2.5rem]">
                {post.title}
              </h1>
              {post.excerpt && (
                <p className="mt-5 text-[1.0625rem] leading-[1.7] text-brown-700">{post.excerpt}</p>
              )}

              <span aria-hidden className="mt-9 block h-px w-full bg-rule" />

              {blocks.map((block, i) => (
                <div key={i} className={cn(gap(blocks[i - 1], block))}>
                  {render(block, i)}
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <ArticleClose variant="card" className="mt-8" />
        </Reveal>
      </div>
    </article>
  );
}

function gap(previous: ArticleBlock | undefined, block: ArticleBlock): string {
  if (!previous) return "mt-9";
  if (block.kind === "heading") return "mt-10";
  if (block.kind === "facts" || previous.kind === "facts") return "mt-8";
  if (block.kind === "figure" || previous.kind === "figure") return "mt-8";
  if (block.kind === "quote" || previous.kind === "quote") return "mt-8";
  return "mt-5";
}

function render(block: ArticleBlock, i: number) {
  switch (block.kind) {
    case "heading":
      return (
        <SectionHeading
          block={block}
          className="text-[0.75rem] font-bold tracking-[0.2em] text-brown-950 uppercase"
        />
      );
    case "figure":
      return (
        <Figure
          block={block}
          sizes="(max-width: 768px) 100vw, 640px"
          frameClassName="border border-rule"
        />
      );
    case "quote":
      return <PullQuote block={block} variant="rule" />;
    case "list":
      return (
        <ArticleList
          items={block.items}
          index={i}
          className="text-[1rem] leading-[1.7] text-brown-800"
        />
      );
    case "facts":
      // The whole reason this template exists: the practical rows, boxed and
      // set apart from the prose, on a ground the eye lands on first.
      return (
        <FactsTable
          rows={block.rows}
          variant="card"
          className="border border-rule bg-paper-warm p-6 sm:p-7"
        />
      );
    default:
      return (
        <Paragraph
          text={block.text}
          index={i}
          className="text-[1rem] leading-[1.75] text-brown-800"
        />
      );
  }
}
