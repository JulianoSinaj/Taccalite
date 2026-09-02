import { describe, it, expect } from "vitest";
import {
  articleBlocks,
  articleIndex,
  firstParagraph,
  formatBlogDate,
  readingMinutes,
  resolveLayout,
  BLOG_LAYOUTS,
  DEFAULT_BLOG_LAYOUT,
} from "@/lib/blog-article";
import { blogPosts } from "@/lib/data";

/**
 * The diary's body grammar.
 *
 * Two things are worth a test rather than a read-through. The first is that the
 * grammar is *additive*: every post written before it existed was a list of
 * plain paragraphs, and those must still come back as plain paragraphs — a
 * regression here rewrites published pages, silently, for content nobody
 * touched. The second is that the four templates and the four seeded posts
 * agree: a post filed under a template that does not exist renders as nothing
 * in particular, and no route would fail.
 */

describe("articleBlocks", () => {
  it("reads a pre-grammar post as the paragraphs it always was", () => {
    const legacy = [
      "Ogni sabato mattina, il profumo della porchetta appena cotta invade il negozio.",
      "Per evitare la fila, è possibile prenotare la propria porchetta entro il venerdì.",
    ];
    expect(articleBlocks(legacy)).toEqual([
      { kind: "paragraph", text: legacy[0] },
      { kind: "paragraph", text: legacy[1] },
    ]);
  });

  it("parses each shape of the grammar", () => {
    const blocks = articleBlocks([
      "## Gli orari",
      "Testo con **grassetto** e [un link](/porchetta).",
      "- prima voce",
      "- seconda voce",
      "| Quando | Ogni sabato",
      "| Dove | In bottega",
      "> Una citazione",
      "— Chi l'ha detta",
      "![La didascalia](/images/banco-carni-vetrina.jpg)",
    ]);

    expect(blocks.map((b) => b.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "facts",
      "quote",
      "figure",
    ]);
    expect(blocks[2]).toEqual({ kind: "list", items: ["prima voce", "seconda voce"] });
    expect(blocks[3]).toEqual({
      kind: "facts",
      rows: [
        { label: "Quando", value: "Ogni sabato" },
        { label: "Dove", value: "In bottega" },
      ],
    });
    expect(blocks[4]).toEqual({
      kind: "quote",
      text: "Una citazione",
      attribution: "Chi l'ha detta",
    });
    expect(blocks[5]).toEqual({
      kind: "figure",
      src: "/images/banco-carni-vetrina.jpg",
      caption: "La didascalia",
      ratio: "larga",
    });
  });

  it("gathers consecutive lines of one kind, blank line or not", () => {
    const one = articleBlocks(["- a\n- b\n- c"]);
    const many = articleBlocks(["- a", "- b", "- c"]);
    expect(one).toEqual(many);
    expect(one).toEqual([{ kind: "list", items: ["a", "b", "c"] }]);
  });

  it("takes the crop from the caption, and leaves an unknown word in it", () => {
    const [known] = articleBlocks(["![Le teglie | alta](/images/gastronomia-teglie-forno.jpg)"]);
    expect(known).toMatchObject({ caption: "Le teglie", ratio: "alta" });

    // A pipe that is not a crop is a typo the author can see; a half-eaten
    // caption is one they cannot.
    const [unknown] = articleBlocks(["![Prima | seconda](/images/gastronomia-teglie-forno.jpg)"]);
    expect(unknown).toMatchObject({ caption: "Prima | seconda", ratio: "larga" });
  });

  it("refuses a remote image rather than rendering a blank frame", () => {
    expect(articleBlocks(["![Foto](https://example.com/x.jpg)"])).toEqual([
      { kind: "paragraph", text: "Foto" },
    ]);
    expect(articleBlocks(["![](//evil.example/x.jpg)"])).toEqual([]);
  });

  it("only treats a dash line as an attribution when a quote is open", () => {
    const [block] = articleBlocks(["— Non è una citazione, è una frase che inizia con un trattino"]);
    expect(block.kind).toBe("paragraph");
  });

  it("gives every heading a distinct anchor, even with the same words", () => {
    const index = articleIndex(articleBlocks(["## Gli orari", "testo", "## Gli orari"]));
    expect(index.map((h) => h.id)).toEqual(["gli-orari-1", "gli-orari-2"]);
  });
});

describe("firstParagraph", () => {
  it("skips a heading, a photograph and a table to find the real opening", () => {
    expect(
      firstParagraph([
        "## Gli orari delle feste",
        "![Copertina](/images/banco-carni-vetrina.jpg)",
        "| Quando | Sabato",
        "Nei giorni di festa cambiano due cose.",
      ]),
    ).toBe("Nei giorni di festa cambiano due cose.");
  });

  it("strips inline markup, because an excerpt is read as plain text", () => {
    expect(firstParagraph(["Passa in **bottega** o [prenota](/prenotazioni)."])).toBe(
      "Passa in bottega o prenota.",
    );
  });

  it("is empty for a post with no prose at all", () => {
    expect(firstParagraph(["## Solo un titolo"])).toBe("");
  });
});

describe("readingMinutes", () => {
  it("never returns zero", () => {
    expect(readingMinutes(["Due parole"])).toBe(1);
    expect(readingMinutes([])).toBe(1);
  });

  it("does not count captions or table rows as reading", () => {
    const prose = Array.from({ length: 400 }, () => "parola").join(" ");
    const withFurniture = [
      prose,
      "![Una didascalia molto lunga che nessuno legge davvero](/images/banco-carni-vetrina.jpg)",
      "| Quando | Ogni sabato mattina dalle nove fino a esaurimento",
    ];
    expect(readingMinutes(withFurniture)).toBe(readingMinutes([prose]));
    expect(readingMinutes([prose])).toBe(2);
  });
});

describe("resolveLayout", () => {
  it("falls back rather than rendering nothing", () => {
    expect(resolveLayout(null)).toBe(DEFAULT_BLOG_LAYOUT);
    expect(resolveLayout("")).toBe(DEFAULT_BLOG_LAYOUT);
    expect(resolveLayout("un-template-che-non-esiste")).toBe(DEFAULT_BLOG_LAYOUT);
  });

  it("keeps every declared template", () => {
    for (const layout of BLOG_LAYOUTS) expect(resolveLayout(layout.value)).toBe(layout.value);
  });
});

describe("formatBlogDate", () => {
  it("prints the calendar date it was given, not the one a timezone shifts it to", () => {
    expect(formatBlogDate("2026-06-20")).toBe("20 giugno 2026");
    // Midnight UTC on the 1st is the 1st in Rome and the previous day in New
    // York; a plain `new Date("2026-01-01")` renders as 31 dicembre 2025 west
    // of Greenwich, which is how a post ends up dated the day before it ran.
    expect(formatBlogDate("2026-01-01")).toBe("1 gennaio 2026");
  });

  it("passes an unparseable value straight through", () => {
    expect(formatBlogDate("prossimamente")).toBe("prossimamente");
  });
});

describe("the seeded diary", () => {
  it("files every post under a template that exists", () => {
    for (const post of blogPosts) {
      expect(resolveLayout(post.layout), `${post.slug} has an unknown layout`).toBe(post.layout);
    }
  });

  it("uses all four templates, which is the point of having four", () => {
    expect(new Set(blogPosts.map((p) => p.layout)).size).toBe(BLOG_LAYOUTS.length);
  });

  it("gives every post a body worth opening", () => {
    for (const post of blogPosts) {
      const blocks = articleBlocks(post.content);
      // The complaint this whole change answers was "little to no text or
      // pictures", so the floor is on all three: enough words to be a read, at
      // least one photograph in the body, and at least one section. Three
      // hundred words is roughly a minute and a half — under that a post is a
      // notice, and the notice template is the shortest thing here.
      expect(readingMinutes(post.content), `${post.slug} is too short to be a post`)
        .toBeGreaterThanOrEqual(2);
      expect(
        blocks.some((b) => b.kind === "figure"),
        `${post.slug} has no photograph in its body`,
      ).toBe(true);
      expect(
        blocks.some((b) => b.kind === "heading"),
        `${post.slug} has no sections`,
      ).toBe(true);
    }
  });
});
