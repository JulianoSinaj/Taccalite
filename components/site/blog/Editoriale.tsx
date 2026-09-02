import Reveal from "@/components/Reveal";
import { cn } from "@/lib/utils";
import type { ArticleBlock } from "@/lib/blog-article";
import {
  ArticleList,
  ArticleMeta,
  Figure,
  FactsTable,
  Paragraph,
  PullQuote,
  SectionHeading,
} from "./ArticleBits";
import { ArticleBackLink, ArticleClose, HeroMedia, type TemplateProps } from "./shared";

/**
 * **Editoriale** — the long read.
 *
 * One column on a book measure (38rem, about 68 characters), a drop cap, and
 * everything that is not prose set *wider* than the prose: the photographs at
 * 52rem, the pull quotes at 44rem, so the reader's eye keeps returning to the
 * same left edge while the page breathes around it. The classic magazine
 * feature, and the right shape for a piece that is mostly sentences.
 *
 * No sticky furniture, no index, nothing in the margin. A story you read from
 * the top does not need navigation.
 */
export default function Editoriale({ post, blocks, date, minutes }: TemplateProps) {
  return (
    <article>
      <header className="px-5 pt-28 pb-12 sm:px-8 sm:pt-32 lg:px-12">
        <Reveal className="mx-auto max-w-[46rem]">
          <ArticleBackLink />
          <ArticleMeta category={post.category} date={date} minutes={minutes} className="mt-10" />
          <h1 className="font-display display-lg mt-7 font-semibold text-brown-950">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mt-7 max-w-[34rem] text-[1.1875rem] leading-[1.7] text-brown-700">
              {post.excerpt}
            </p>
          )}
        </Reveal>
      </header>

      <Reveal className="px-5 sm:px-8 lg:px-12">
        <HeroMedia
          post={post}
          className="mx-auto max-w-[62rem]"
          aspectClassName="aspect-[16/9]"
          sizes="(max-width: 1024px) 100vw, 992px"
        />
      </Reveal>

      <div className="px-5 pb-4 sm:px-8 lg:px-12">
        {blocks.map((block, i) => (
          <Reveal key={i} className={cn(gap(blocks[i - 1], block))} y={20}>
            {render(block, i)}
          </Reveal>
        ))}
      </div>

      <ArticleClose variant="rule" className="mx-auto max-w-[38rem] px-5 sm:px-8" />
    </article>
  );
}

/** The vertical rhythm, decided by which two blocks meet. */
function gap(previous: ArticleBlock | undefined, block: ArticleBlock): string {
  if (!previous) return "mt-16";
  if (block.kind === "heading") return "mt-16 sm:mt-20";
  if (block.kind === "figure" || block.kind === "quote") return "mt-14 sm:mt-16";
  if (previous.kind === "figure" || previous.kind === "quote") return "mt-14 sm:mt-16";
  if (previous.kind === "heading") return "mt-7";
  return "mt-7";
}

function render(block: ArticleBlock, i: number) {
  switch (block.kind) {
    case "heading":
      return (
        <div className="mx-auto max-w-[38rem]">
          <span aria-hidden className="mb-6 block h-px w-12 bg-[var(--acc)]" />
          <SectionHeading
            block={block}
            className="font-display display-md font-semibold text-brown-950"
          />
        </div>
      );
    case "figure":
      return (
        <Figure
          block={block}
          className="mx-auto max-w-[52rem]"
          sizes="(max-width: 900px) 100vw, 832px"
          // A portrait crop at this width is 1040px tall — taller than the
          // window, so the reader meets an edge of photograph with no top and no
          // bottom. Capped against the viewport instead.
          frameClassName="max-h-[78vh]"
          captionClassName="mx-auto max-w-[38rem]"
        />
      );
    case "quote":
      return <PullQuote block={block} variant="rule" className="mx-auto max-w-[44rem]" />;
    case "list":
      return (
        <ArticleList
          items={block.items}
          index={i}
          className="mx-auto max-w-[38rem] text-[1.0625rem] leading-[1.75] text-brown-800"
        />
      );
    case "facts":
      return <FactsTable rows={block.rows} variant="rows" className="mx-auto max-w-[38rem]" />;
    default:
      return (
        <Paragraph
          text={block.text}
          index={i}
          dropCap={i === 0}
          className="mx-auto max-w-[38rem] text-[1.125rem] leading-[1.8] text-brown-800"
        />
      );
  }
}
