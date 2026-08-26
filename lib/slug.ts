import "server-only";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { db } from "@/lib/db/client";

// The pure half lives in `lib/slug-core.ts` so the seed scripts can build a slug
// without importing this module's `server-only` runtime. Re-exported here so
// every caller keeps importing `slugify` from where it always did.
export { slugify } from "./slug-core";
import { slugify } from "./slug-core";

/**
 * Resolve the slug to store for a record.
 *
 * Prefers an explicit slug, then a readable one derived from `fallbackText`
 * (the product/reward/post name), and only reaches for a random suffix when the
 * derived slug is empty or already taken. Every entity with a slug went through
 * some version of this; a few just used `nanoid(8)` outright, which produced
 * catalogue URLs like `/negozio/a7Kx9pQ2`.
 *
 * `excludeId` keeps a record from colliding with itself on update.
 */
export async function resolveSlug(opts: {
  table: SQLiteTable;
  slugColumn: SQLiteColumn;
  idColumn: SQLiteColumn;
  explicit?: string;
  fallbackText: string;
  excludeId?: string;
}): Promise<string> {
  const { table, slugColumn, idColumn, explicit, fallbackText, excludeId } = opts;
  if (explicit) return explicit;

  const taken = async (candidate: string): Promise<boolean> => {
    const rows = await db
      .select({ id: idColumn })
      .from(table)
      .where(eq(slugColumn, candidate));
    return rows.some((r) => r.id !== excludeId);
  };

  const base = slugify(fallbackText);
  if (base && !(await taken(base))) return base;

  // Try a couple of numbered variants before falling back to randomness, so
  // "salame" → "salame-2" rather than "salame-x7Kq2p".
  for (let n = 2; n <= 5; n++) {
    const candidate = `${base || "voce"}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${base ? `${base}-` : ""}${nanoid(6)}`;
}
