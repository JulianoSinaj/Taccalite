import Image from "next/image";
import Reveal from "@/components/Reveal";
import ProductPlate from "@/components/site/ProductPlate";
import { PhotoCredit } from "@/components/site/PhotoCredit";
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
import { ArticleBackLink, ArticleClose, type TemplateProps } from "./shared";

/**
 * **Galleria** — the photo essay.
 *
 * The cover fills the screen with the headline set over it, and from then on the
 * photographs run edge to edge while the prose stays on a narrow column in the
 * middle. Two photographs in a row become a pair; a quote becomes a band across
 * the page. The rhythm is picture, passage, picture — which is the whole point,
 * and the reason this template ignores the container the other three respect.
 *
 * For the posts where the pictures *are* the argument: the counter, the curing
 * room, a day at the fair.
 */
export default function Galleria({ post, blocks, date, minutes }: TemplateProps) {
  return (
    <article>
      {/* The cover. A photograph if there is one, and the printed plate lit from
          behind if there is not — never an empty dark box. */}
      <header className="relative flex h-[72vh] min-h-[26rem] w-full items-end overflow-hidden bg-brown-950">
        {post.image ? (
          <>
            <Image
              src={post.image}
              alt=""
              fill
              preload
              sizes="100vw"
              className="object-cover"
            />
            <PhotoCredit src={post.image} />
          </>
        ) : (
          <div className="absolute inset-0 opacity-45">
            <ProductPlate name={post.title} category={post.category} seed={post.slug} />
          </div>
        )}
        {/* The scrim is set by the *type*, not by taste. Cream at 85% over a
            45% wash on a bright photograph — and these are bright photographs,
            pale salumi under shop lighting — measures about 4.3:1, which fails
            for the 11px meta line sitting exactly there. At 72% through the
            middle of the ramp it is ~6.4:1 and the picture is still legible.
            The top stays nearly clear: nothing is set over it. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-brown-950/95 from-15% via-brown-950/72 via-55% to-brown-950/12"
        />
        <div className="relative w-full px-5 pt-28 pb-12 sm:px-8 sm:pb-16 lg:px-12">
          <div className="mx-auto max-w-[88rem]">
            <ArticleBackLink tone="dark" />
            <ArticleMeta
              category={post.category}
              date={date}
              minutes={minutes}
              tone="dark"
              className="mt-8"
            />
            <h1 className="font-display display-lg mt-6 max-w-[20ch] font-semibold text-cream">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-6 max-w-[38rem] text-[1.0625rem] leading-relaxed text-cream/85">
                {post.excerpt}
              </p>
            )}
          </div>
        </div>
      </header>

      {post.imageLabel && (
        <p className="mx-auto max-w-[88rem] px-5 pt-4 text-[0.6875rem] font-semibold tracking-[0.16em] text-taupe uppercase sm:px-8 lg:px-12">
          {post.imageLabel}
        </p>
      )}

      <Body items={group(blocks)} />

      <ArticleClose variant="band" className="mt-16" />
    </article>
  );
}

function Body({ items }: { items: Item[] }) {
  return (
    <div className="pt-12 pb-4">
      {items.map((item, i) => (
        <Reveal key={i} className={cn(gap(item, items[i - 1]))} y={20}>
          {render(item, i)}
        </Reveal>
      ))}
    </div>
  );
}

/**
 * A run of consecutive photographs is one item, so a pair can be set as a pair.
 *
 * `figure` is excluded from the union rather than merely unused: after grouping
 * a lone figure cannot exist, and saying so in the type is what keeps `render`
 * from needing a branch for a case that can never arrive.
 */
type Item =
  | { kind: "figures"; figures: Extract<ArticleBlock, { kind: "figure" }>[] }
  | Exclude<ArticleBlock, { kind: "figure" }>;

function group(blocks: ArticleBlock[]): Item[] {
  const out: Item[] = [];
  for (const block of blocks) {
    if (block.kind !== "figure") {
      out.push(block);
      continue;
    }
    const last = out[out.length - 1];
    if (last?.kind === "figures") last.figures.push(block);
    else out.push({ kind: "figures", figures: [block] });
  }
  return out;
}

function gap(item: Item, previous: Item | undefined): string {
  if (!previous) return "";
  if (item.kind === "figures" || previous.kind === "figures") return "mt-14 sm:mt-20";
  if (item.kind === "quote") return "mt-16 sm:mt-20";
  if (previous.kind === "quote") return "mt-16 sm:mt-20";
  if (item.kind === "heading") return "mt-14";
  if (previous.kind === "heading") return "mt-6";
  return "mt-6";
}

/** The narrow column everything that is not a photograph sits on. */
const MEASURE = "mx-auto max-w-[40rem] px-5 sm:px-8";

function render(item: Item, i: number) {
  switch (item.kind) {
    case "figures": {
      const pair = item.figures.length > 1;
      return (
        <div
          className={cn(
            "mx-auto",
            pair
              ? "grid max-w-[88rem] grid-cols-1 gap-5 px-5 sm:grid-cols-2 sm:px-8 lg:px-12"
              : "max-w-none",
          )}
        >
          {item.figures.map((figure, j) => (
            <Figure
              key={j}
              block={figure}
              sizes={pair ? "(max-width: 640px) 100vw, 44vw" : "100vw"}
              className={pair ? undefined : "w-full"}
              // A ratio is a shape, not a licence to be 1400px tall: a `larga`
              // photograph running the full width of a desktop window is 960px
              // of image, which scrolls past as a wall rather than reading as a
              // picture. The cap crops it; `object-cover` was going to crop
              // something either way.
              frameClassName={pair ? undefined : "max-h-[82vh]"}
              captionClassName={
                pair ? undefined : "mx-auto max-w-[88rem] px-5 sm:px-8 lg:px-12"
              }
            />
          ))}
        </div>
      );
    }
    case "heading":
      return (
        <div className={MEASURE}>
          <span aria-hidden className="mb-5 block h-px w-12 bg-[var(--acc)]" />
          <SectionHeading
            block={item}
            className="font-display text-[1.75rem] leading-tight font-semibold text-brown-950 sm:text-[2.125rem]"
          />
        </div>
      );
    case "quote":
      return (
        <div className="bg-paper-warm px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
          <PullQuote block={item} variant="centred" />
        </div>
      );
    case "list":
      return (
        <ArticleList
          items={item.items}
          index={i}
          className={cn(MEASURE, "text-[1.0625rem] leading-[1.75] text-brown-800")}
        />
      );
    case "facts":
      return <FactsTable rows={item.rows} variant="rows" className={MEASURE} />;
    default:
      return (
        <Paragraph
          text={item.text}
          index={i}
          className={cn(MEASURE, "text-[1.0625rem] leading-[1.8] text-brown-800")}
        />
      );
  }
}
