import Link from "next/link";
import type { ReactNode } from "react";

/**
 * `**grassetto**` and `[testo](/destinazione)`, and nothing else.
 *
 * Extracted from `RichText` when the diary grew a body grammar of its own: the
 * legal pages and a blog post disagree about what a *block* is — one has no
 * photographs, the other has pull quotes and a table of opening hours — but they
 * must agree exactly about what a *line* is, or "**sabato**" would come out bold
 * on a privacy policy and literal in a news post.
 *
 * Nothing here ever reaches `dangerouslySetInnerHTML`. The grammar is closed, so
 * an editor can only produce a `<strong>` and a link to a destination
 * `safeHref` allows — which is what makes this safe by construction rather than
 * by sanitising.
 */

/** Only these destinations are rendered as links. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  if (/^https?:\/\//i.test(h)) return h;
  if (/^mailto:[^\s<>]+@[^\s<>]+$/i.test(h)) return h;
  if (/^tel:[+\d\s-]+$/i.test(h)) return h;
  return null;
}

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

/**
 * Bold and links inside one line.
 *
 * `linkClassName` exists because the two callers style links from opposite
 * directions: the legal pages set them once on a `.prose`-style wrapper, while a
 * blog body has no wrapper and wants the storefront's `underline-draw` on each
 * one.
 */
export function inline(text: string, keyPrefix: string, linkClassName?: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((part, i) => {
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
            <Link key={key} href={href} className={linkClassName}>
              {link[1]}
            </Link>
          );
        }
        const external = href.startsWith("http");
        return (
          <a
            key={key}
            href={href}
            className={linkClassName}
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
