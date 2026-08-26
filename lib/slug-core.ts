/**
 * Slug construction, with no server-only dependencies.
 *
 * Split out of `lib/slug.ts` (which is `server-only`, because the rest of it
 * takes a database connection to check uniqueness) so the seed scripts — plain
 * CLI processes, and `lib/db/seed-data.ts` which they import — can build a slug
 * without pulling the server runtime in. `lib/slug.ts` re-exports this, so every
 * existing importer is unaffected.
 */

/**
 * Build a URL slug from free text: lowercase, accents stripped, spaces and other
 * characters collapsed to hyphens, edges trimmed. May legitimately return "" for
 * input with no usable characters (e.g. only emoji), which callers must handle.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // spaces & non [a-z0-9] → hyphen
    .replace(/-+/g, "-") // collapse repeats
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}
