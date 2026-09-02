import { describe, it, expect } from "vitest";
import { serialiseJsonLd } from "@/components/JsonLd";

/**
 * JSON-LD is written straight into a `<script>` element, and its values are
 * product names, descriptions and shop details — all editable from the
 * gestionale and importable from a CSV.
 *
 * `JSON.stringify` escapes what JSON needs escaped, and `<` is not on that list.
 * So a product called `Salame </script><script>…</script>` closed the tag, and
 * everything after it was parsed as markup — on the public product page, for
 * every visitor. The CSP does not help: `script-src` carries `'unsafe-inline'`
 * because Next's hydration bootstrap requires it.
 */

const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

describe("serialiseJsonLd", () => {
  it("never emits a script tag, however a value is written", () => {
    const out = serialiseJsonLd({
      "@type": "Product",
      name: "Salame </script><script>alert(document.cookie)</script>",
    });

    expect(out).not.toContain("</script");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<");
  });

  it("escapes an angle bracket wherever it appears, in keys as well as values", () => {
    const out = serialiseJsonLd({ description: "a < b > c", "<key>": "v" });
    expect(out).not.toContain("<");
    // `>` is harmless on its own — only the opening bracket can start a tag.
    expect(out).toContain(">");
  });

  it("still parses back to exactly the same data", () => {
    // The escaping must be invisible to whatever reads the structured data.
    const input = {
      "@type": "Product",
      name: "Salame </script> & friends",
      description: `Righe\ncon <tag> e ${LINE_SEP} separatori`,
      offers: { price: 12.5, currency: "EUR" },
    };
    expect(JSON.parse(serialiseJsonLd(input))).toEqual(input);
  });

  it("escapes the separators that are legal in JSON but not in JavaScript", () => {
    const out = serialiseJsonLd({ name: `a${LINE_SEP}b${PARA_SEP}c` });
    expect(out).not.toContain(LINE_SEP);
    expect(out).not.toContain(PARA_SEP);
    expect(JSON.parse(out).name).toBe(`a${LINE_SEP}b${PARA_SEP}c`);
  });

  it("leaves ordinary content alone", () => {
    expect(serialiseJsonLd({ name: "Ciauscolo IGP", price: 8.5 })).toBe(
      '{"name":"Ciauscolo IGP","price":8.5}',
    );
  });
});
