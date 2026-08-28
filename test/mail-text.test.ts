import { describe, expect, it } from "vitest";
import { htmlToText, newsletterBroadcast } from "@/lib/mail/templates";

/**
 * The plain-text half of a newsletter.
 *
 * Every other template writes both halves by hand; this one cannot, because its
 * body is composed in the gestionale. It used to be derived with
 * `replace(/<[^>]+>/g, "")`, which ran the paragraphs together, left entities as
 * literals and threw away every link — so a message whose whole point was "book
 * here" arrived with nothing to act on.
 */
describe("htmlToText", () => {
  it("keeps a link's destination beside its text", () => {
    expect(htmlToText('<p>Vedi il <a href="https://x.it/p">nostro sito</a>.</p>')).toBe(
      "Vedi il nostro sito (https://x.it/p).",
    );
  });

  it("does not repeat a URL that is already its own label", () => {
    expect(htmlToText('<a href="https://x.it">https://x.it</a>')).toBe("https://x.it");
  });

  it("separates blocks, and keeps list items on their own lines", () => {
    expect(htmlToText("<p>uno</p><p>due</p>")).toBe("uno\n\ndue");
    expect(htmlToText("<ul><li>a</li><li>b</li></ul><p>fine</p>")).toBe("• a\n• b\n\nfine");
    expect(htmlToText("riga<br>altra")).toBe("riga\naltra");
  });

  it("collapses the holes an airy body would leave", () => {
    expect(htmlToText("<p>a</p><div></div><div></div><p>b</p>")).toBe("a\n\nb");
  });

  it("decodes entities without decoding twice", () => {
    expect(htmlToText("<p>5 &lt; 6 &amp; 7</p>")).toBe("5 < 6 & 7");
    // The trap: `&amp;lt;` is a literal "&lt;", not a "<".
    expect(htmlToText("<p>a &amp;lt; b</p>")).toBe("a &lt; b");
    expect(htmlToText("<p>caff&#232; &#x2014; ok</p>")).toBe("caffè — ok");
  });

  it("tells grave from acute, which in Italian is a spelling matter", () => {
    expect(htmlToText("<p>Perch&eacute; no</p>")).toBe("Perché no");
    expect(htmlToText("<p>Caff&egrave; e citt&agrave;</p>")).toBe("Caffè e città");
    expect(htmlToText("<p>&Egrave; vero</p>")).toBe("È vero");
  });

  it("drops scripts and styles rather than printing them", () => {
    expect(htmlToText("<p>a</p><script>alert(1)</script><style>p{color:red}</style>")).toBe("a");
  });
});

describe("newsletterBroadcast", () => {
  const build = () =>
    newsletterBroadcast(
      "Il sabato della porchetta",
      '<p>Ciao! Trovi tutto <a href="https://x.it/porchetta">qui</a>.</p>',
      "https://x.it/u/abc",
    );

  it("carries the unsubscribe link in the text part too", () => {
    // It used to be appended to the wrapped body only, so the text half of a
    // marketing email had no way out of the list at all.
    expect(build().text).toContain("https://x.it/u/abc");
  });

  it("carries the body's own links in the text part", () => {
    expect(build().text).toContain("https://x.it/porchetta");
  });

  it("previews as the subject rather than as the letterhead", () => {
    const { html } = build();
    const preheader = html.match(/opacity:0;">([^<]*)</)?.[1];
    expect(preheader).toBe("Il sabato della porchetta");
  });
});
