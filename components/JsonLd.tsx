/**
 * Renders one or more JSON-LD schema objects as a <script type="application/ld+json">.
 * Server component — safe to embed in any page.
 */
export default function JsonLd({ schema }: { schema: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = Array.isArray(schema) ? schema : [schema];
  return (
    <>
      {json.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  );
}
