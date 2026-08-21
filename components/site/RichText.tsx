import Link from "next/link";
import type { ReactNode } from "react";

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

/** Only these destinations are rendered as links. */
function safeHref(href: string): string | null {
  const h = href.trim();
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  if (/^https?:\/\//i.test(h)) return h;
  if (/^mailto:[^\s<>]+@[^\s<>]+$/i.test(h)) return h;
  if (/^tel:[+\d\s-]+$/i.test(h)) return h;
  return null;
}

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

/** Bold and links inside one line. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={key}>{bold[1]}</strong>;

    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]);
      // An unsafe destination degrades to its own label: the words stay, the
      // link does not.
      if (!href) return link[1];
      if (href.startsWith("/")) {
        return (
          <Link key={key} href={href}>
            {link[1]}
          </Link>
        );
      }
      const external = href.startsWith("http");
      return (
        <a
          key={key}
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {link[1]}
        </a>
      );
    }
    // Plain text goes back as a plain string: wrapping every run in a <span>
    // would put an element around most of a legal document for no reason, and
    // React needs no key for a text child.
    return part;
  });
}

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
