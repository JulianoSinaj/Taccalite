/**
 * Renders one or more JSON-LD schema objects as a <script type="application/ld+json">.
 * Server component - safe to embed in any page.
 */

/**
 * Serialise for embedding inside a `<script>` element.
 *
 * `JSON.stringify` escapes what JSON needs escaped, and `<` is not on that list
 * - so a value containing `</script>` closed the tag and everything after it was
 * parsed as markup. The values here are product names, descriptions and shop
 * details, all editable from the gestionale and importable from a CSV, so a
 * product called `Salame </script><script>...</script>` ran on the public page
 * for every visitor. The CSP does not help: `script-src` carries
 * `'unsafe-inline'` because Next's hydration bootstrap requires it.
 *
 * The replacement emits the two-character sequence backslash-u003c, which is a
 * valid JSON escape for `<` and parses back to the same string - so what a
 * search engine reads is unchanged. U+2028 and U+2029 go too: legal inside a
 * JSON string, not inside a JavaScript one, and free to escape here.
 */
function serialise(item: Record<string, unknown>): string {
  return JSON.stringify(item).replace(
    /[<\u2028\u2029]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export default function JsonLd({ schema }: { schema: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = Array.isArray(schema) ? schema : [schema];
  return (
    <>
      {json.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serialise(item) }}
        />
      ))}
    </>
  );
}

export { serialise as serialiseJsonLd };
