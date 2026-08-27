/**
 * The two category vocabularies — shared by the (server) categories page and
 * the (client) drag-and-drop list. Deliberately its own plain module: a Server
 * Component can only use a `"use client"` file's exports as JSX, not as plain
 * values (`KINDS.find(...)` on an import from a client module fails at runtime
 * with "KINDS.find is not a function" — the binding is a client reference, not
 * the real array, when evaluated server-side).
 *
 * Separate lists on purpose: the shop files products under "Formaggi" and posts
 * under "Formaggi" too, and they are not the same thing. Product categories are
 * pages on the storefront; news categories are a label on the article.
 */
export const KINDS = [
  { value: "product", label: "Prodotti", one: "prodotto", many: "prodotti", listHref: "/admin/products" },
  { value: "post", label: "News", one: "articolo", many: "articoli", listHref: "/admin/blog" },
] as const;

export type KindMeta = (typeof KINDS)[number];
export type Kind = KindMeta["value"];

export function countOf(n: number, k: KindMeta) {
  return `${n} ${n === 1 ? k.one : k.many}`;
}
