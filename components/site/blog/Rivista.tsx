import Reveal from "@/components/Reveal";
import { cn } from "@/lib/utils";
import { articleIndex, type ArticleBlock } from "@/lib/blog-article";
import {
  ArticleList,
  Figure,
  FactsTable,
  Paragraph,
  PullQuote,
  SectionHeading,
} from "./ArticleBits";
import { ArticleBackLink, ArticleClose, HeroMedia, type TemplateProps } from "./shared";

/**
 * **Rivista** — the feature spread.
 *
 * A masthead that puts the headline and the cover photograph side by side, then
 * a two-column body: a rail that stays with you (category, date, reading time
 * and an index of the sections) and the article beside it. Sections are
 * numbered, and a photograph's caption sits in the right margin rather than
 * under the frame.
 *
 * The shape for a long, structured piece — a round-up of six new cheeses, a
 * guide, anything a reader will want to skim before deciding where to start.
 * The index is built from the `##` headings, so it costs the writer nothing.
 */
export default function Rivista({ post, blocks, date, minutes }: TemplateProps) {
  const index = articleIndex(blocks);
  // Section numbers, worked out before the map rather than by a counter
  // incremented inside it: the React Compiler lint rejects reassigning a
  // variable during render, and correctly — a memoised subtree would re-run the
  // callback without re-running the counter and the numbering would drift.
  const sectionNumbers = new Map(
    blocks.flatMap((b, i) => (b.kind === "heading" ? [[i, 0]] : [])).map(([i], n) => [i, n + 1]),
  );

  return (
    <article>
      <header className="border-b border-rule bg-paper-warm px-5 pt-28 pb-14 sm:px-8 sm:pt-32 lg:px-12">
        <div className="mx-auto grid max-w-[88rem] items-end gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
          <Reveal>
            <ArticleBackLink />
            <p className="mt-9 flex items-center gap-3 text-[0.6875rem] font-semibold tracking-[0.2em] text-[var(--acc)] uppercase">
              <span aria-hidden className="size-[5px] rotate-45 bg-[var(--acc)]" />
              {post.category}
            </p>
            <h1 className="font-display display-lg mt-6 font-semibold text-brown-950">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-7 max-w-[36rem] text-[1.1875rem] leading-[1.7] text-brown-700">
                {post.excerpt}
              </p>
            )}
          </Reveal>
          <Reveal delay={0.1}>
            <HeroMedia
              post={post}
              aspectClassName="aspect-[4/5]"
              sizes="(max-width: 1024px) 100vw, 384px"
            />
          </Reveal>
        </div>
      </header>

      <div className="mx-auto grid max-w-[88rem] gap-x-16 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[14rem_minmax(0,1fr)] lg:px-12">
        {/* The rail. `self-start` is what lets `sticky` work inside a grid: a
            stretched track is as tall as the article, so there is nothing left
            for the element to travel through. */}
        <aside className="mb-12 self-start lg:sticky lg:top-28 lg:mb-0">
          <dl className="space-y-4 border-t border-rule-strong pt-5 text-[0.6875rem] font-semibold tracking-[0.16em] uppercase">
            <div className="flex justify-between gap-4">
              <dt className="text-taupe">Data</dt>
              <dd className="text-brown-950">{date}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-taupe">Lettura</dt>
              <dd className="text-brown-950">{minutes} min</dd>
            </div>
          </dl>

          {index.length > 1 && (
            <nav aria-label="Indice dell'articolo" className="mt-10 border-t border-rule pt-5">
              <p className="text-[0.625rem] font-semibold tracking-[0.22em] text-gold-deep uppercase">
                In questo articolo
              </p>
              <ol className="mt-5 space-y-3.5">
                {index.map((entry, i) => (
                  <li key={entry.id} className="flex gap-3">
                    <span
                      aria-hidden
                      className="mt-[0.15rem] text-[0.625rem] font-semibold text-tan tabular-nums"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <a
                      href={`#${entry.id}`}
                      className="tap text-[0.875rem] leading-snug text-brown-700 transition-colors hover:text-[var(--acc)]"
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </aside>

        <div className="min-w-0">
          {blocks.map((block, i) => (
            <Reveal key={i} className={cn(gap(blocks[i - 1], block))} y={20}>
              {render(block, i, sectionNumbers.get(i) ?? 0)}
            </Reveal>
          ))}
          <ArticleClose variant="card" className="mt-16 max-w-[44rem]" />
        </div>
      </div>
    </article>
  );
}

function gap(previous: ArticleBlock | undefined, block: ArticleBlock): string {
  if (!previous) return "";
  if (block.kind === "heading") return "mt-14 sm:mt-16";
  if (block.kind === "figure") return "mt-12";
  if (block.kind === "quote") return "mt-12";
  if (previous.kind === "figure" || previous.kind === "quote") return "mt-12";
  if (previous.kind === "heading") return "mt-6";
  return "mt-6";
}

function render(block: ArticleBlock, i: number, section: number) {
  switch (block.kind) {
    case "heading":
      return (
        <SectionHeading
          block={block}
          number={section}
          className="font-display max-w-[44rem] text-[1.625rem] leading-tight font-semibold text-brown-950 sm:text-[2rem]"
        />
      );
    case "figure":
      // The caption in the right margin, not under the frame — the one device
      // that most makes a page read as a spread rather than as a document.
      return (
        <Figure
          block={block}
          sizes="(max-width: 1024px) 100vw, 720px"
          className="lg:grid lg:grid-cols-[minmax(0,1fr)_10rem] lg:items-end lg:gap-6"
          captionClassName="lg:mt-0 lg:pb-1"
        />
      );
    case "quote":
      return <PullQuote block={block} variant="margin" className="max-w-[40rem]" />;
    case "list":
      return (
        <ArticleList
          items={block.items}
          index={i}
          className="max-w-[44rem] text-[1.0625rem] leading-[1.75] text-brown-800"
        />
      );
    case "facts":
      return <FactsTable rows={block.rows} variant="rows" className="max-w-[44rem]" />;
    default:
      return (
        <Paragraph
          text={block.text}
          index={i}
          className="max-w-[44rem] text-[1.0625rem] leading-[1.8] text-brown-800"
        />
      );
  }
}
