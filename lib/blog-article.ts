/**
 * The diary's article grammar, and the four templates that render it.
 *
 * A post used to be `string[]` and nothing else — one paragraph per entry, no
 * headings, no photographs inside the body, no way to set a date and a place
 * apart from the prose around them. Three posts of two sentences each is what
 * that shape encourages, and three posts of two sentences each is what the
 * diary held.
 *
 * So the storage stays exactly what it was — a JSON array of blocks, blank-line
 * separated in the editor — and *the strings* carry a closed grammar this module
 * parses into typed blocks:
 *
 *     ## Un titolo di sezione
 *     - una voce di elenco
 *     > Una citazione, anche su più righe
 *     — Chi l'ha detta
 *     ![La didascalia](/images/banco-carni-vetrina.jpg)
 *     | Quando | Ogni sabato dalle 9:00
 *     Testo normale, con **grassetto** e [un link](/porchetta).
 *
 * Two consequences worth stating. First, every post written before the grammar
 * existed still parses: a line matching none of the prefixes is a paragraph,
 * which is what all of them were. Second, nothing here is ever handed to
 * `dangerouslySetInnerHTML` — an editor can only produce the six shapes below,
 * so the safety is by construction rather than by sanitising, the same bargain
 * `components/site/RichText.tsx` makes for the legal pages.
 *
 * Pure and free of `server-only`, so the admin editor can parse in the browser
 * for its live preview and the tests can run it without a database.
 */

// ── Blocks ───────────────────────────────────────────────────────────────────

export type ArticleBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string; id: string }
  | { kind: "quote"; text: string; attribution: string }
  | { kind: "figure"; src: string; caption: string; ratio: FigureRatio }
  | { kind: "list"; items: string[] }
  | { kind: "facts"; rows: { label: string; value: string }[] };

/**
 * How a body photograph is cropped.
 *
 * A frame has to commit to a ratio — every image on this site is `fill` +
 * `object-cover`, because nothing knows a JPEG's intrinsic size at render time
 * — and the shop's photographs are half portrait and half landscape. Without
 * this the vertical ones (the salumi on their hooks, the norcino at the slicer)
 * came back as a 16/9 letterbox through the middle of the subject.
 *
 * Named in Italian, because the person choosing is the person writing the post:
 * `![Didascalia | alta](/images/x.jpg)`.
 */
export const FIGURE_RATIOS = {
  larga: "3/2",
  panoramica: "16/9",
  quadrata: "1/1",
  alta: "4/5",
} as const;

export type FigureRatio = keyof typeof FIGURE_RATIOS;

export const DEFAULT_FIGURE_RATIO: FigureRatio = "larga";

/** `![Didascalia](/images/x.jpg)` — the caption may be empty, the src may not. */
const FIGURE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
/** `| Etichetta | Valore` — the value may itself contain no pipes. */
const FACT = /^\|\s*([^|]+?)\s*\|\s*(.*)$/;
/** An attribution line closing a quote: an em dash, an en dash or two hyphens. */
const ATTRIBUTION = /^(?:—|–|--)\s*(.+)$/;

/** Only local photographs. A body image is chosen from `public/images`, never
 *  hotlinked, so anything else is dropped rather than rendered as a hole. */
function safeImageSrc(src: string): string | null {
  const s = src.trim();
  return s.startsWith("/") && !s.startsWith("//") ? s : null;
}

/**
 * `Didascalia | alta` → the caption and its crop.
 *
 * An unrecognised word after the pipe stays part of the caption rather than
 * being swallowed: a sentence containing a pipe is a typo the author can see,
 * while a silently deleted half-caption is one they cannot.
 */
function splitCaption(raw: string): { caption: string; ratio: FigureRatio } {
  const at = raw.lastIndexOf("|");
  if (at === -1) return { caption: raw.trim(), ratio: DEFAULT_FIGURE_RATIO };
  const word = raw.slice(at + 1).trim().toLowerCase();
  if (!(word in FIGURE_RATIOS)) return { caption: raw.trim(), ratio: DEFAULT_FIGURE_RATIO };
  return { caption: raw.slice(0, at).trim(), ratio: word as FigureRatio };
}

/**
 * A stable anchor for a heading, so the magazine template's index can link to
 * its sections. Position-suffixed rather than deduplicated by counting: two
 * sections legitimately called "Gli orari" must not both answer to `#gli-orari`.
 */
function headingId(text: string, position: number): string {
  const base = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "sezione"}-${position}`;
}

/**
 * Parse the stored blocks into the article.
 *
 * Runs line by line rather than block by block, because the editor is one
 * textarea and nobody separates a heading from the list under it with a blank
 * line every time. Consecutive lines of the same kind gather: three `- ` lines
 * are one list, four `| ` lines are one table, and a `> ` run is one quote.
 */
export function articleBlocks(content: readonly string[]): ArticleBlock[] {
  const out: ArticleBlock[] = [];
  let list: string[] = [];
  let facts: { label: string; value: string }[] = [];
  let quote: string[] = [];
  let quoteAttribution = "";
  let headings = 0;

  const flush = () => {
    if (list.length) {
      out.push({ kind: "list", items: list });
      list = [];
    }
    if (facts.length) {
      out.push({ kind: "facts", rows: facts });
      facts = [];
    }
    if (quote.length) {
      out.push({ kind: "quote", text: quote.join(" "), attribution: quoteAttribution });
      quote = [];
      quoteAttribution = "";
    }
  };

  for (const raw of content) {
    for (const line of String(raw ?? "").split("\n")) {
      const t = line.trim();
      if (!t) {
        flush();
        continue;
      }

      // An attribution belongs to the quote it follows; anywhere else it is
      // just a sentence that happens to open with a dash.
      if (quote.length && !quoteAttribution) {
        const attributed = ATTRIBUTION.exec(t);
        if (attributed) {
          quoteAttribution = attributed[1];
          continue;
        }
      }

      if (t.startsWith("## ")) {
        flush();
        const text = t.slice(3).trim();
        out.push({ kind: "heading", text, id: headingId(text, ++headings) });
        continue;
      }

      if (t.startsWith("- ")) {
        if (facts.length || quote.length) flush();
        list.push(t.slice(2).trim());
        continue;
      }

      if (t.startsWith("> ")) {
        if (list.length || facts.length) flush();
        quote.push(t.slice(2).trim());
        continue;
      }

      const fact = FACT.exec(t);
      if (fact) {
        if (list.length || quote.length) flush();
        facts.push({ label: fact[1], value: fact[2].trim() });
        continue;
      }

      const figure = FIGURE.exec(t);
      if (figure) {
        flush();
        const src = safeImageSrc(figure[2]);
        const { caption, ratio } = splitCaption(figure[1]);
        // An unusable src degrades to its caption rather than to a blank frame:
        // `<Image src="">` renders an empty box and says nothing about why.
        if (src) out.push({ kind: "figure", src, caption, ratio });
        else if (caption) out.push({ kind: "paragraph", text: caption });
        continue;
      }

      flush();
      out.push({ kind: "paragraph", text: t });
    }
  }
  flush();
  return out;
}

/** The headings, in order — the magazine template's index. */
export function articleIndex(blocks: readonly ArticleBlock[]): { id: string; text: string }[] {
  return blocks.flatMap((b) => (b.kind === "heading" ? [{ id: b.id, text: b.text }] : []));
}

/**
 * The first real sentence of a post.
 *
 * The excerpt is derived from this when the editor leaves it blank, and a post
 * that opens with a heading or a photograph — which is now most of them — would
 * otherwise be listed under "## Gli orari" or under nothing at all.
 */
export function firstParagraph(content: readonly string[]): string {
  const first = articleBlocks(content).find((b) => b.kind === "paragraph");
  return first ? stripInline(first.text) : "";
}

/** `**grassetto**` and `[testo](/link)` reduced to the words they carry. */
export function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

/**
 * Reading time in whole minutes, at 200 words — never zero, because "0 min di
 * lettura" reads as a broken template rather than as a short post.
 *
 * Counts only what is actually read: a caption and a table of opening hours are
 * scanned, not read, and inflating the estimate with them is the small lie that
 * makes the number worthless.
 */
export function readingMinutes(content: readonly string[]): number {
  const words = articleBlocks(content).reduce((n, b) => {
    if (b.kind === "paragraph" || b.kind === "heading") return n + countWords(b.text);
    if (b.kind === "quote") return n + countWords(b.text);
    if (b.kind === "list") return n + b.items.reduce((m, i) => m + countWords(i), 0);
    return n;
  }, 0);
  return Math.max(1, Math.round(words / 200));
}

/**
 * `2026-06-20` → `20 giugno 2026`.
 *
 * The same three lines were written out in `BlogCard`, in the index and in the
 * post page; the four templates would have made it seven. Timezone-free on
 * purpose: the column is a plain calendar date, not an instant, so parsing it
 * as UTC and printing it in Rome is the one way it can come out a day early.
 */
export function formatBlogDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function countWords(text: string): number {
  const words = stripInline(text).match(/[^\s]+/g);
  return words ? words.length : 0;
}

// ── Templates ────────────────────────────────────────────────────────────────

/**
 * The four article templates.
 *
 * Deliberately four *structures*, not four skins: a long read on a book measure
 * with a drop cap, a magazine spread with a sticky rail and an index, a printed
 * notice that leads with the facts, and a photo essay that leads with the
 * pictures. Which one a post gets is an editorial decision the shop makes per
 * post in the gestionale, which is why this is a column and not a rule keyed off
 * the category.
 */
export const BLOG_LAYOUTS = [
  {
    value: "editoriale",
    label: "Editoriale — la lettura lunga",
    hint: "Colonna stretta, capolettera, foto larghe e citazioni a tutta pagina. Per le storie da raccontare.",
  },
  {
    value: "rivista",
    label: "Rivista — il servizio",
    hint: "Due colonne con indice laterale e sezioni numerate. Per gli articoli lunghi e strutturati.",
  },
  {
    value: "avviso",
    label: "Avviso — il bollettino",
    hint: "Scheda con le informazioni pratiche in testa, testo compatto. Per orari, chiusure e comunicazioni.",
  },
  {
    value: "galleria",
    label: "Galleria — il fotoracconto",
    hint: "Copertina a tutto schermo e foto a piena larghezza fra i paragrafi. Per i post con molte immagini.",
  },
] as const;

export type BlogLayout = (typeof BLOG_LAYOUTS)[number]["value"];

export const DEFAULT_BLOG_LAYOUT: BlogLayout = "editoriale";

const LAYOUT_VALUES = new Set<string>(BLOG_LAYOUTS.map((l) => l.value));

/** A stored value that is not one of the four falls back to the default rather
 *  than rendering nothing — the column has no CHECK constraint by design. */
export function resolveLayout(value: string | null | undefined): BlogLayout {
  return value && LAYOUT_VALUES.has(value) ? (value as BlogLayout) : DEFAULT_BLOG_LAYOUT;
}
