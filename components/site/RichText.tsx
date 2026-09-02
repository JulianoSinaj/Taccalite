import type { ReactNode } from "react";
import { inline } from "@/components/site/inline-markup";

/**
 * The smallest markup that survives being edited by the shop.
 *
 * The legal pages and the history page carry structure that plain paragraphs
 * cannot hold — section headings, bullet lists, a `mailto:` and a couple of
 * outbound links — so making them editable meant choosing between losing that
 * structure and accepting arbitrary HTML from a form field. Neither is
 * acceptable for a privacy policy.
 *
 * So this parses a closed grammar into React elements. Nothing is ever passed to
 * `dangerouslySetInnerHTML`, which is what makes it safe by construction rather
 * than by sanitising: an editor can only produce the four things below, and a
 * `javascript:` URL is not one of them.
 *
 *   ## Titolo di sezione
 *   - voce di elenco
 *   Testo normale, con **grassetto** e [un link](/negozi) o [email](mailto:a@b.it).
 *
 * A blank line separates blocks. Anything unrecognised renders as literal text,
 * which is the right failure: a stray bracket shows up as a stray bracket
 * instead of eating the paragraph.
 */

export default function RichText({ blocks }: { blocks: string[] }) {
  const out: ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    out.push(
      <ul key={`ul-${key}`}>
        {items.map((li, i) => (
          <li key={i}>{inline(li, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
  };

  blocks.forEach((raw, bi) => {
    // A block may itself hold several lines: a heading and its list arrive
    // together when someone edits the textarea as one paragraph.
    for (const [li, line] of raw.split("\n").entries()) {
      const t = line.trim();
      const key = `${bi}-${li}`;
      if (!t) {
        flushList(key);
        continue;
      }
      if (t.startsWith("## ")) {
        flushList(key);
        out.push(<h2 key={`h-${key}`}>{inline(t.slice(3), key)}</h2>);
      } else if (t.startsWith("- ")) {
        list.push(t.slice(2));
      } else {
        flushList(key);
        out.push(<p key={`p-${key}`}>{inline(t, key)}</p>);
      }
    }
  });
  flushList("end");

  return <>{out}</>;
}
