import type { ReactNode } from "react";

/**
 * The gold-emphasis convention for editable headlines.
 *
 * Every display heading on the storefront sets one fragment apart — "dal 1946.",
 * "di persona." — in `wonk text-gold-deep`. That was JSX, which is exactly why
 * those headings could not be edited from the gestionale: the emphasis lived in
 * the markup rather than in the words.
 *
 * `**…**` marks it instead, reusing the syntax `RichText` already gives the shop
 * for bold inside a paragraph, so there is one convention to learn rather than
 * two. Text with no marker renders unchanged, which is what makes adopting this
 * on an existing heading a no-op until somebody actually types the asterisks.
 */
const EMPHASIS = /(\*\*[^*]+\*\*)/g;

export function emphasise(text: string, keyPrefix = "h"): ReactNode[] {
  return text
    .split(EMPHASIS)
    .filter(Boolean)
    .map((part, i) => {
      const marked = /^\*\*([^*]+)\*\*$/.exec(part);
      if (!marked) return part;
      return (
        <span key={`${keyPrefix}-${i}`} className="wonk text-gold-deep">
          {marked[1]}
        </span>
      );
    });
}

/** The same thing as an element, for a heading that is a single line of copy. */
export default function Headline({ text, keyPrefix }: { text: string; keyPrefix?: string }) {
  return <>{emphasise(text, keyPrefix)}</>;
}
