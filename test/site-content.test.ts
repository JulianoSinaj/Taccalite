import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import RichText from "@/components/site/RichText";
import { emphasise } from "@/components/site/Headline";
import {
  SITE_CONTENT,
  parseLines,
  parseRecords,
  parseBlocks,
  applyTokens,
  contentDef,
} from "@/lib/site-content";

const html = (blocks: string[]) => renderToStaticMarkup(createElement(RichText, { blocks }));

describe("site content registry", () => {
  it("has a unique key and a group for every entry", () => {
    const keys = SITE_CONTENT.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const d of SITE_CONTENT) {
      expect(d.group).toBeTruthy();
      expect(d.label).toBeTruthy();
    }
  });

  it("declares field names for every records entry", () => {
    // Without them `parseRecords` produces empty objects and the page renders
    // blank cards — a silent failure rather than a loud one.
    for (const d of SITE_CONTENT.filter((d) => d.type === "records")) {
      expect(d.fields?.length, d.key).toBeGreaterThan(0);
    }
  });

  it("ships a default for everything, so an empty table renders the site", () => {
    for (const d of SITE_CONTENT) expect(d.default.trim(), d.key).not.toBe("");
  });

  it("parses each records default into complete rows", () => {
    for (const d of SITE_CONTENT.filter((d) => d.type === "records")) {
      const rows = parseRecords(d.default, d.fields!);
      expect(rows.length, d.key).toBeGreaterThan(0);
      for (const r of rows) {
        for (const f of d.fields!) expect(r[f], `${d.key}.${f}`).not.toBe("");
      }
    }
  });
});

describe("parsers", () => {
  it("drops blank lines and trims", () => {
    expect(parseLines("  a  \n\n b \n")).toEqual(["a", "b"]);
  });

  it("keeps a half-typed record instead of dropping it", () => {
    // A half-finished line should show up as a half-filled card the owner can
    // see and finish, not vanish.
    expect(parseRecords("Titolo | corpo\nSolo titolo", ["title", "body"])).toEqual([
      { title: "Titolo", body: "corpo" },
      { title: "Solo titolo", body: "" },
    ]);
  });

  it("splits paragraphs on blank lines", () => {
    expect(parseBlocks("uno\n\n\ndue")).toEqual(["uno", "due"]);
  });

  it("substitutes the site's identity into the legal copy", () => {
    expect(applyTokens("scrivi a {email}")).toContain("@");
    expect(applyTokens("{legalName} tratta i dati")).toContain("Taccalite");
  });
});

describe("RichText", () => {
  it("renders headings, lists, bold and internal links", () => {
    const out = html(["## Titolo", "- primo\n- secondo", "Testo **forte** e [un link](/negozi)."]);
    expect(out).toContain("<h2>Titolo</h2>");
    expect(out).toContain("<li>");
    expect(out).toContain("<strong>forte</strong>");
    expect(out).toContain('href="/negozi"');
  });

  it("opens an external link in a new tab, and a mailto in place", () => {
    const out = html(["[Google](https://policies.google.com/privacy) e [scrivici](mailto:a@b.it)"]);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('href="mailto:a@b.it"');
  });

  it("never emits a javascript: or data: destination", () => {
    // The whole reason this parses instead of accepting HTML: the editor is a
    // plain textarea in the back office, and a legal page is a strange place to
    // open an injection surface.
    const out = html([
      "[clicca](javascript:alert(1)) e [altro](data:text/html,<script>) e [rete](//evil.example)",
    ]);
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:text/html");
    expect(out).not.toContain("//evil.example");
    // The words survive even though the links do not.
    expect(out).toContain("clicca");
    expect(out).toContain("rete");
  });

  it("escapes markup typed into the text", () => {
    const out = html(["<script>alert(1)</script>"]);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("renders the shipped legal defaults with their structure intact", () => {
    const privacy = contentDef("legal.privacy.body")!;
    const out = html(parseBlocks(applyTokens(privacy.default)));
    expect(out).toContain("<h2>1. Titolare del trattamento</h2>");
    expect(out).toContain("<h2>6. I tuoi diritti</h2>");
    expect(out).toContain('href="/cookie"');
    expect(out).toContain("mailto:");
    expect((out.match(/<li>/g) ?? []).length).toBe(8);
  });
});

describe("editable headlines", () => {
  it("renders the marked fragment in gold and leaves the rest alone", () => {
    const out = renderToStaticMarkup(
      createElement("h1", {}, emphasise("Parliamone **di persona.**")),
    );
    expect(out).toContain("Parliamone ");
    expect(out).toContain('class="wonk text-gold-deep"');
    expect(out).toContain("di persona.");
    // The markers are a formatting instruction, never characters on the page.
    expect(out).not.toContain("**");
  });

  it("passes text with no marker through untouched", () => {
    // What makes adopting the convention on an existing heading a no-op.
    const out = renderToStaticMarkup(createElement("h1", {}, emphasise("Scriveteci")));
    expect(out).toBe("<h1>Scriveteci</h1>");
  });

  it("handles an emphasis that is the whole line, and one at the start", () => {
    expect(renderToStaticMarkup(createElement("h1", {}, emphasise("**dal 1946.**")))).toContain(
      "wonk",
    );
    const start = renderToStaticMarkup(createElement("h1", {}, emphasise("**Oggi** al banco")));
    expect(start).toContain("wonk");
    expect(start).toContain(" al banco");
  });

  it("keeps the hero headline and the contatti title editable and marked up", () => {
    // These two are the storefront's first line of copy. If either loses its
    // registry entry the page silently falls back to nothing at all, so the
    // keys the pages read are asserted here rather than trusted.
    for (const key of ["home.hero.titolo", "home.hero.testo", "contatti.titolo"]) {
      expect(contentDef(key), key).toBeTruthy();
    }
    const hero = contentDef("home.hero.titolo")!;
    expect(parseLines(hero.default)).toHaveLength(3);
    // The gold fragment lives in the text now, not in the JSX.
    expect(hero.default).toContain("**");
    expect(contentDef("contatti.titolo")!.default).toContain("**");
  });
});
